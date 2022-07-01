// SPDX-License-Identifier: Apache 2

pragma solidity ^0.7.6;
pragma abicoder v2;

import './shared/IWormhole.sol';
import './shared/SwapHelper.sol';
import './shared/TokenBridge.sol';
import './shared/WETH.sol';
import 'solidity-bytes-utils/contracts/BytesLib.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";


/// @title A cross-chain UniswapV2 example
/// @notice Swaps against UniswapV2 pools and uses Wormhole TokenBridge
/// for cross-chain transfers 
contract CrossChainSwapV2 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;
    uint8 public immutable TypeExactIn = 1;
    uint8 public immutable TypeExactOut = 2;
    IUniswapV2Router02 public immutable SWAP_ROUTER;
    address public immutable FEE_TOKEN_ADDRESS;
    address public immutable TOKEN_BRIDGE_ADDRESS;
    address public immutable WRAPPED_NATIVE;

    constructor(
        address _swapRouterAddress, 
        address _feeTokenAddress, 
        address _tokenBridgeAddress, 
        address _wrappedNativeAddress
    ) {
        SWAP_ROUTER = IUniswapV2Router02(_swapRouterAddress);
        FEE_TOKEN_ADDRESS = _feeTokenAddress;
        TOKEN_BRIDGE_ADDRESS = _tokenBridgeAddress;
        WRAPPED_NATIVE = _wrappedNativeAddress;
    }

    /// @dev Used to communicate information about executed swaps to UI/user
    event SwapResult(
        address indexed _recipient,
        address _tokenOut,
        address _from,
        uint256 _amountOut,
        uint8 _success
    );

    /// @dev Returns the parsed TokenBridge payload which contains swap 
    /// instructions after redeeming the VAA from the TokenBridge
    function _getParsedPayload(
        bytes calldata encodedVaa,
        uint8 swapFunctionType
    ) private returns (SwapHelper.DecodedVaaParameters memory payload) {
        // complete the transfer on the token bridge
        bytes memory vmPayload = TokenBridge(
            TOKEN_BRIDGE_ADDRESS
        ).completeTransferWithPayload(encodedVaa);

        // parse the payload 
        payload = SwapHelper.decodeVaaPayload(vmPayload);

        // sanity check payload parameters
        require(
            payload.swapFunctionType==swapFunctionType, 
            "incorrect swapFunctionType in payload"
        ); 
    }    

    /// @dev Executes exactIn native asset swap and pays the relayer
    function recvAndSwapExactNativeIn(
        bytes calldata encodedVaa
    ) external payable returns (uint256[] memory amounts) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                TypeExactIn
            );

        // create dynamic address array 
        // uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];

        // sanity check path
        require(
            uniPath[0]==FEE_TOKEN_ADDRESS, 
            "tokenIn must be feeToken"
        );
        require(
            uniPath[1]==WRAPPED_NATIVE, 
            "tokenOut must be wrapped native asset"
        );

        // approve the router to spend tokens
        TransferHelper.safeApprove(
            uniPath[0], 
            address(SWAP_ROUTER), 
            payload.swapAmount
        );

        // try to execute the swap
        try SWAP_ROUTER.swapExactTokensForTokens(
            payload.swapAmount,
            payload.estimatedAmount,
            uniPath,
            address(this), 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // calculate how much to pay the relayer in the native token
            uint256 nativeRelayerFee = amounts[1] * payload.relayerFee / payload.swapAmount;
            uint256 nativeAmountOut = amounts[1] - nativeRelayerFee;

            // unwrap native and send to recipient
            IWETH(WRAPPED_NATIVE).withdraw(amounts[1]);
            payable(payload.recipientAddress).transfer(nativeAmountOut);

            /// pay the relayer in the native token
            payable(msg.sender).transfer(nativeRelayerFee);

            // used in UI to tell user they're getting
            // their desired token
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[1], 
                msg.sender, 
                nativeAmountOut,
                1
            );
            return amounts;
        } catch {
            // pay relayer in the feeToken since the swap failed 
            IERC20 feeToken = IERC20(FEE_TOKEN_ADDRESS); 
            feeToken.safeTransfer(msg.sender, payload.relayerFee);

            // swap failed - return feeToken to recipient
            feeToken.safeTransfer(
                payload.recipientAddress, 
                payload.swapAmount - payload.relayerFee
            );

            // used in UI to tell user they're getting
            // feeToken instead of their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[0], 
                msg.sender, 
                payload.swapAmount - payload.relayerFee,
                0
            );
        }
    }

    /// @dev Executes exactOut native asset swap and pays the relayer
    function recvAndSwapExactNativeOut(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                TypeExactOut
            );

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];

        // sanity check path
        require(
            uniPath[0]==FEE_TOKEN_ADDRESS, 
            "tokenIn must be feeToken"
        );
        require(
            payload.path[1]==WRAPPED_NATIVE, 
            "tokenOut must be wrapped native asset"
        );

        // pay the relayer in feeToken so that user gets desired exact amount out
        IERC20 feeToken = IERC20(FEE_TOKEN_ADDRESS);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 maxAmountInLessFees = payload.swapAmount - payload.relayerFee;

        // amountOut is the estimated swap amount for exact out methods
        uint256 amountOut = payload.estimatedAmount;

        // approve the router to spend tokens
        TransferHelper.safeApprove(
            uniPath[0], 
            address(SWAP_ROUTER), 
            maxAmountInLessFees
        ); 

        // try to perform the swap 
        try SWAP_ROUTER.swapTokensForExactTokens(
            amountOut,
            maxAmountInLessFees,
            uniPath,
            address(this), 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // amountIn used is first element in array
            amountInUsed = amounts[0];

            // refund recipient with any feeToken not used in the swap
            if (amountInUsed < maxAmountInLessFees) {
                TransferHelper.safeApprove(
                    FEE_TOKEN_ADDRESS, 
                    address(SWAP_ROUTER), 
                    0
                );
                IERC20(FEE_TOKEN_ADDRESS).safeTransfer(
                    payload.recipientAddress, 
                    maxAmountInLessFees - amountInUsed
                );
            }

            // unwrap native and send to recipient
            IWETH(WRAPPED_NATIVE).withdraw(amounts[1]);
            payable(payload.recipientAddress).transfer(amounts[1]);

            // used in UI to tell user they're getting
            // their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[1], 
                msg.sender, 
                amounts[1],
                1
            );
            return amountInUsed;
        } catch {
            // swap failed - return feeToken to recipient
            IERC20(FEE_TOKEN_ADDRESS).safeTransfer(
                payload.recipientAddress, 
                maxAmountInLessFees
            );

            // used in UI to tell user they're getting
            // feeToken instead of their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[0], 
                msg.sender, 
                maxAmountInLessFees,
                0
            );
        }
    }


    /// @dev Executes exactIn native asset swap
    function _swapExactInBeforeTransfer(
        uint256 amountIn,
        uint256 amountOutMinimum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        // approve the router to spend tokens
        TransferHelper.safeApprove(
            path[0], 
            address(SWAP_ROUTER), 
            amountIn
        );

        // perform the swap
        uint256[] memory amounts = SWAP_ROUTER.swapExactTokensForTokens(
            amountIn,
            amountOutMinimum,
            path,
            address(this), 
            deadline
        );
        amountOut = amounts[1];
    }

    /// @dev Calls _swapExactInBeforeTransfer and encodes custom payload with 
    /// instructions for executing native asset swaps on the destination chain
    function swapExactNativeInAndTransfer(
        SwapHelper.ExactInParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable { 
        require(
            swapParams.amountOutMinimum > relayerFee, 
            "insufficient amountOutMinimum to pay relayer"
        );
        require(
            path[0]==WRAPPED_NATIVE, 
            "tokenIn must be wrapped native asset for first swap"
        ); 
        require(
            path[1]==FEE_TOKEN_ADDRESS, 
            "tokenOut must be feeToken for first swap"
        );
        require(msg.value > 0, "must pass non 0 native asset amount");

        // wrap native asset
        IWETH(WRAPPED_NATIVE).deposit{
            value : msg.value
        }();

        // peform the first swap
        uint256 amountOut = _swapExactInBeforeTransfer(
            msg.value, 
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2],
            swapParams.deadline
        );

        // create payload with target swap instructions
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOutMinimum,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            TypeExactIn,
            relayerFee
        );  
        
        // approve token bridge to spend feeTokens
        TransferHelper.safeApprove(
            FEE_TOKEN_ADDRESS, 
            TOKEN_BRIDGE_ADDRESS, 
            amountOut
        );

        // send transfer with payload to the TokenBridge
        TokenBridge(TOKEN_BRIDGE_ADDRESS).transferTokensWithPayload(
            FEE_TOKEN_ADDRESS, 
            amountOut, 
            targetChainId, 
            targetContractAddress,
            nonce, 
            payload
        );
    }
 
    /// @dev Executes exactOut native asset swaps
    function _swapExactOutBeforeTransfer(
        uint256 amountOut,
        uint256 amountInMaximum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline
    ) internal {
        // approve the router to spend tokens
        TransferHelper.safeApprove(
            path[0], 
            address(SWAP_ROUTER), 
            amountInMaximum
        );

        // perform the swap
        uint256[] memory amounts = SWAP_ROUTER.swapTokensForExactTokens(
            amountOut,
            amountInMaximum,
            path,
            address(this), 
            deadline
        );

        // amountIn used is first element in array
        uint256 amountInUsed = amounts[0];

        // refund contractCaller with any amountIn that wasn't spent 
        if (amountInUsed < amountInMaximum) {
            // unwrap remaining native asset and send to contractCaller
            TransferHelper.safeApprove(path[0], address(SWAP_ROUTER), 0);
            IWETH(WRAPPED_NATIVE).withdraw(
                amountInMaximum - amountInUsed
            ); 
            payable(contractCaller).transfer(
                amountInMaximum - amountInUsed
            );
        }
    }

    /// @dev Calls _swapExactOutBeforeTransfer and encodes custom payload with 
    /// instructions for executing native asset swaps on the destination chain
    function swapExactNativeOutAndTransfer(
        SwapHelper.ExactOutParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable { 
        require(
            swapParams.amountOut > relayerFee, 
            "insufficient amountOut to pay relayer"
        );
        require(
            path[0]==WRAPPED_NATIVE, 
            "tokenIn must be wrapped native asset for first swap"
        );
        require(
            path[1]==FEE_TOKEN_ADDRESS, 
            "tokenOut must be feeToken for first swap"
        );
        require(msg.value > 0, "must pass non 0 native asset amount");

        // wrap native asset
        IWETH(WRAPPED_NATIVE).deposit{
            value : msg.value
        }();

        // peform the first swap
        _swapExactOutBeforeTransfer(
            swapParams.amountOut, 
            msg.value,  
            msg.sender,
            path[0:2], 
            swapParams.deadline
        );

        // create payload with target swap instructions
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOut,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            TypeExactOut,
            relayerFee
        );  

        // approve token bridge to spend feeTokens
        TransferHelper.safeApprove(
            FEE_TOKEN_ADDRESS, 
            TOKEN_BRIDGE_ADDRESS, 
            swapParams.amountOut
        );

        // send transfer with payload to the TokenBridge
        TokenBridge(TOKEN_BRIDGE_ADDRESS).transferTokensWithPayload(
            FEE_TOKEN_ADDRESS, 
            swapParams.amountOut, 
            targetChainId, 
            targetContractAddress, 
            nonce, 
            payload
        );
    }

    // necessary for receiving native assets
    receive() external payable {}
}