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
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';


interface IUniswapRouter is ISwapRouter {
    function refundETH() external payable;
}


/// @title A cross-chain UniswapV3 example 
/// @notice Swaps against UniswapV3 pools and uses Wormhole TokenBridge
/// for cross-chain transfers
contract CrossChainSwapV3 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;
    uint8 public immutable TypeExactIn = 1;
    uint8 public immutable TypeExactOut = 2;
    IUniswapRouter public immutable SWAP_ROUTER;
    address public immutable FEE_TOKEN_ADDRESS;
    address public immutable TOKEN_BRIDGE_ADDRESS;
    address public immutable WRAPPED_NATIVE;

    constructor(
        address _swapRouterAddress, 
        address _feeTokenAddress, 
        address _tokenBridgeAddress,
        address _wrappedNativeAddress
    ) {
        SWAP_ROUTER = IUniswapRouter(_swapRouterAddress);
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
    ) external returns (uint256 amountOut) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                TypeExactIn
            );  

        // sanity check path 
        require(
            payload.path[0]==FEE_TOKEN_ADDRESS, 
            "tokenIn must be feeToken"
        );
        require(
            payload.path[1]==WRAPPED_NATIVE, 
            "tokenOut must be wrapped Native"
        ); 

        // approve the router to spend tokens 
        TransferHelper.safeApprove(
            payload.path[0], 
            address(SWAP_ROUTER), 
            payload.swapAmount
        );
        
        // set swap options with user params
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: address(this), 
                deadline: payload.deadline,
                amountIn: payload.swapAmount,
                amountOutMinimum: payload.estimatedAmount,
                sqrtPriceLimitX96: 0
            });

        // try to execute the swap 
        try SWAP_ROUTER.exactInputSingle(params) returns (uint256 amountOut) {
            // calculate how much to pay the relayer in the native token
            uint256 nativeRelayerFee = amountOut * payload.relayerFee / payload.swapAmount;
            uint256 nativeAmountOut = amountOut - nativeRelayerFee;

            // unwrap native and send to recipient 
            IWETH(WRAPPED_NATIVE).withdraw(amountOut);
            payable(payload.recipientAddress).transfer(nativeAmountOut);

            /// pay the relayer in the native token
            payable(msg.sender).transfer(nativeRelayerFee);

            // used in UI to tell user they're getting
            // their desired token
            emit SwapResult(
                payload.recipientAddress, 
                payload.path[1], 
                msg.sender, 
                nativeAmountOut,
                1
            );
            return amountOut;
        } catch {
            // pay relayer in the feeToken since the swap failed
            IERC20 feeToken = IERC20(FEE_TOKEN_ADDRESS); 
            feeToken.safeTransfer(msg.sender, payload.relayerFee);  

            // swap failed - return feeToken (less relayer fees) to recipient
            feeToken.safeTransfer(
                payload.recipientAddress, 
                payload.swapAmount - payload.relayerFee
            );

            // used in UI to tell user they're getting
            // feeToken instead of their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                payload.path[0], 
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

        // sanity check path
        require(
            payload.path[0]==FEE_TOKEN_ADDRESS, 
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
            payload.path[0], 
            address(SWAP_ROUTER), 
            maxAmountInLessFees
        ); 

        // set swap options with user params
        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: address(this), 
                deadline: payload.deadline,
                amountOut: amountOut,
                amountInMaximum: maxAmountInLessFees, 
                sqrtPriceLimitX96: 0
            });

        // try to perform the swap
        try SWAP_ROUTER.exactOutputSingle(params) returns (uint256 amountInUsed) {
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
            IWETH(WRAPPED_NATIVE).withdraw(amountOut);
            payable(payload.recipientAddress).transfer(amountOut);

            // used in UI to tell user they're getting
            // their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                payload.path[1], 
                msg.sender, 
                amountOut,
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
                payload.path[0], 
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
        uint256 deadline,
        uint24 poolFee
    ) internal returns (uint256 amountOut) {
        // set swap options with user params
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: path[0],
                tokenOut: path[1],
                fee: poolFee,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn, 
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            });

        // perform the swap
        amountOut = SWAP_ROUTER.exactInputSingle{value: amountIn}(params);
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

        // peform the first swap
        uint256 amountOut = _swapExactInBeforeTransfer(
            msg.value,
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            swapParams.poolFee
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
        uint256 deadline,
        uint24 poolFee
    ) internal {  
        // set swap options with user params
        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: path[0],
                tokenOut: path[1],
                fee: poolFee,
                recipient: address(this),
                deadline: deadline,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // executes the swap returning the amountInUsed 
        // ask for our money back -_- after the swap executes        
        uint256 amountInUsed = SWAP_ROUTER.exactOutputSingle{value: amountInMaximum}(params);
        SWAP_ROUTER.refundETH();

        // return unused native asset to contractCaller
        if (amountInUsed < amountInMaximum) {
            // set SWAP_ROUTER allowance to zero
            TransferHelper.safeApprove(path[0], address(SWAP_ROUTER), 0);
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

        // peform the first swap
        _swapExactOutBeforeTransfer(
            swapParams.amountOut, 
            msg.value, 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            swapParams.poolFee
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