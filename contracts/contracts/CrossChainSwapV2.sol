pragma solidity ^0.7.6;
pragma abicoder v2;

import './IWormhole.sol';
import './SwapHelper.sol';
import 'solidity-bytes-utils/contracts/BytesLib.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";


interface TokenBridge {
  function transferTokensWithPayload(
      address token,
      uint256 amount,
      uint16 recipientChain,
      bytes32 recipient,
      uint256 arbiterFee,
      uint32 nonce,
      bytes memory payload
    ) external payable returns (uint64);
    function completeTransferWithPayload(
        bytes memory encodedVm
    ) external returns (IWormhole.VM memory);
}


interface IWMATIC is IERC20 {
    function deposit() external payable;
    function withdraw(uint amount) external;
}


/// @title A cross-chain UniswapV2 example 
contract CrossChainSwapV2 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;
    uint8 public immutable typeExactIn = 1;
    uint8 public immutable typeExactOut = 2;
    uint8 public immutable typeNativeSwap = 1;
    uint8 public immutable typeTokenSwap = 2;
    uint16 public immutable expectedVaaLength = 262;
    IUniswapV2Router02 public immutable swapRouter;
    address public immutable feeTokenAddress;
    address public immutable tokenBridgeAddress;
    address public immutable wrappedMatic;

    constructor(
        address _swapRouterAddress, 
        address _feeTokenAddress, 
        address _tokenBridgeAddress, 
        address _wrappedMaticAddress
    ) {
        swapRouter = IUniswapV2Router02(_swapRouterAddress);
        feeTokenAddress = _feeTokenAddress;
        tokenBridgeAddress = _tokenBridgeAddress;
        wrappedMatic = _wrappedMaticAddress;
    }

    event SwapResult(
        address indexed _recipient, 
        address indexed _tokenOut, 
        address indexed _from, 
        uint256 _amountOut
    );

    function _getParsedPayload(
        bytes calldata encodedVaa,
        uint8 swapFunctionType,
        uint8 swapCurrencyType
    ) private returns (SwapHelper.DecodedVaaParameters memory payload) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(
            vm.payload.length==expectedVaaLength, 
            "VAA has the wrong number of bytes"
        );

        // parse the payload 
        payload = SwapHelper.decodeVaaPayload(vm);

        // sanity check payload parameters
        require(
            payload.swapFunctionType==swapFunctionType, 
            "swap must be type ExactIn"
        ); 
        require(
            payload.swapCurrencyType==swapCurrencyType, 
            "incorrect swapCurrencyType in payload"
        ); 
    }    

    //function swapExactNativeInFromV3(
    function recvAndSwapExactNativeIn(
        bytes calldata encodedVaa
    ) external payable returns (uint256[] memory amounts) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                typeExactIn,
                typeNativeSwap
            );

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];
        require(uniPath[0]==feeTokenAddress, "tokenIn must be UST");
        require(uniPath[1]==wrappedMatic, "tokenOut must be wMATIC");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 swapAmountLessFees = (
            payload.swapAmount - payload.relayerFee
        );

        // approve the router to spend tokens
        TransferHelper.safeApprove(
            uniPath[0], 
            address(swapRouter), 
            swapAmountLessFees
        );

        // try to perform the swap
        try swapRouter.swapExactTokensForTokens(
            swapAmountLessFees,
            payload.estimatedAmount,
            uniPath,
            address(this), 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // unwrap native and send to recipient
            IWMATIC(wrappedMatic).withdraw(amounts[1]);
            payable(payload.recipientAddress).transfer(amounts[1]);

            // used in UI to tell user they're getting
            // their desired token
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[1], 
                msg.sender, 
                amounts[1]
            );
            return amounts;
        } catch {
            // swap failed - return UST to recipient
            feeToken.safeTransfer(
                payload.recipientAddress, 
                swapAmountLessFees
            );

            // used in UI to tell user they're getting
            // UST instead of their desired native asset
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[0], 
                msg.sender, 
                swapAmountLessFees
            );
        }
    }

    //function swapExactInFromV3(
    function recvAndSwapExactIn(
        bytes calldata encodedVaa
    ) external returns (uint256[] memory amounts) {
        // redeem and fetch the parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                typeExactIn,
                typeTokenSwap
            );

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];
        require(uniPath[0]==feeTokenAddress, "tokenIn must be UST");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 swapAmountLessFees = (
            payload.swapAmount - payload.relayerFee
        );

        // approve the router to spend tokens
        TransferHelper.safeApprove(
            uniPath[0], 
            address(swapRouter), 
            swapAmountLessFees
        );

        // try to perform the swap
        try swapRouter.swapExactTokensForTokens(
            swapAmountLessFees,
            payload.estimatedAmount,
            uniPath,
            payload.recipientAddress, 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // used in UI to tell user they're getting
            // their desired token
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[1], 
                msg.sender, 
                amounts[1]
            );
            return amounts;
        } catch {
            // swap failed - return UST to recipient
            feeToken.safeTransfer(
                payload.recipientAddress, 
                swapAmountLessFees
            );
            // used in UI to tell user they're getting
            // UST instead of their desired token
            emit SwapResult(
                payload.recipientAddress, 
                uniPath[0], 
                msg.sender, 
                swapAmountLessFees
            );
        }   
    }

    function _swapExactInBeforeTransfer(
        uint256 amountIn,
        uint256 amountOutMinimum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline
    ) internal returns (uint256 amountOut) {
        // path[0] is the tokenIn in 
        IERC20 token = IERC20(path[0]);
        token.safeTransferFrom(contractCaller, address(this), amountIn);

        // approve the router to spend tokens
        TransferHelper.safeApprove(path[0], address(swapRouter), amountIn);

        // perform the swap
        uint256[] memory amounts = swapRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMinimum,
            path,
            address(this), 
            deadline
        );
        amountOut = amounts[1];
    }

    //function swapExactInToV3(
    function swapExactInAndTransfer(
        SwapHelper.ExactInParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external { 
        require(swapParams.amountOutMinimum > relayerFee, "insufficient amountOutMinimum to pay relayer"); 
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");

        // peform the first swap
        uint256 amountOut = _swapExactInBeforeTransfer(
            swapParams.amountIn, 
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2],
            swapParams.deadline
        );

        // encode payload for second swap
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOutMinimum,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            typeExactIn,
            typeTokenSwap
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    }

    //function swapExactNativeInToV3(
    function swapExactNativeInAndTransfer(
        SwapHelper.ExactInParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable { 
        require(swapParams.amountOutMinimum > relayerFee, "insufficient amountOutMinimum to pay relayer");
        require(path[0]==wrappedMatic, "tokenIn must be wMATIC for first swap"); 
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");
        require(msg.value > 0, "must pass non 0 MATIC amount");

        // wrap MATIC
        IWMATIC(wrappedMatic).deposit{
            value : msg.value
        }();

        // peform the first swap
        uint256 amountOut = _swapExactInBeforeTransfer(
            msg.value, // MATIC value sent in transaction is the amountIn 
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2],
            swapParams.deadline
        );

        // encode payload for second swap
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOutMinimum,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            typeExactIn,
            typeNativeSwap
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    }

    //function swapExactNativeOutFromV3(
    function recvAndSwapExactNativeOut(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                typeExactOut,
                typeNativeSwap
            );
    
        // amountOut is the estimated swap amount for exact out methods
        uint256 amountOut = payload.estimatedAmount;

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];
        require(uniPath[0]==feeTokenAddress, "tokenIn must be UST");
        require(payload.path[1]==wrappedMatic, "tokenOut must be wMATIC");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 maxAmountInLessFees = payload.swapAmount - payload.relayerFee;
        
        // approve the router to spend tokens
        TransferHelper.safeApprove(uniPath[0], address(swapRouter), maxAmountInLessFees); 

        // try to perform the swap 
        try swapRouter.swapTokensForExactTokens(
            amountOut,
            maxAmountInLessFees,
            uniPath,
            address(this), // send wMATIC to this contract, then unwrap and send to recipient 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // amountIn used is first element in array
            amountInUsed = amounts[0];

            // refund recipient with any UST not used in the swap
            if (amountInUsed < maxAmountInLessFees) {
                TransferHelper.safeApprove(feeTokenAddress, address(swapRouter), 0);
                feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees - amountInUsed);
            }
            // unwrap the wMATIC this contract received from the swap and send to the recipient
            IWMATIC(wrappedMatic).withdraw(amounts[1]);
            payable(payload.recipientAddress).transfer(amounts[1]);
            emit SwapResult(payload.recipientAddress, uniPath[1], msg.sender, amounts[1]);
            return amountInUsed;
        } catch {
            feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees);
            emit SwapResult(payload.recipientAddress, uniPath[0], msg.sender, maxAmountInLessFees);
        }
    }

    //function swapExactOutFromV3(
    function recvAndSwapExactOut(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // redeem and fetch parsed payload
        SwapHelper.DecodedVaaParameters memory payload =
            _getParsedPayload(
                encodedVaa,
                typeExactOut,
                typeTokenSwap
            );
    
        // amountOut is the estimated swap amount for exact out methods
        uint256 amountOut = payload.estimatedAmount;

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];
        require(uniPath[0]==feeTokenAddress, "tokenIn must be UST");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 maxAmountInLessFees = payload.swapAmount - payload.relayerFee;
        
        // approve the router to spend tokens
        TransferHelper.safeApprove(uniPath[0], address(swapRouter), maxAmountInLessFees); 

        // try to perform the swap 
        try swapRouter.swapTokensForExactTokens(
            amountOut,
            maxAmountInLessFees,
            uniPath,
            payload.recipientAddress, 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            // amountIn used is first element in array
            amountInUsed = amounts[0];

            // refund recipient with any UST not used in the swap
            if (amountInUsed < maxAmountInLessFees) {
                TransferHelper.safeApprove(feeTokenAddress, address(swapRouter), 0);
                feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees - amountInUsed);
            }
            emit SwapResult(payload.recipientAddress, uniPath[1], msg.sender, amounts[1]);
            return amountInUsed;
        } catch {
            feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees);
            emit SwapResult(payload.recipientAddress, uniPath[0], msg.sender, maxAmountInLessFees);
        }
    }

    function _swapExactOutBeforeTransfer(
        uint256 amountOut,
        uint256 amountInMaximum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline,
        uint8 swapType
    ) public payable {
        // path[0] is the tokenIn
        IERC20 token = IERC20(path[0]);
        token.safeTransferFrom(contractCaller, address(this), amountInMaximum);

        // approve the router to spend tokens
        TransferHelper.safeApprove(path[0], address(swapRouter), amountInMaximum);

        // perform the swap
        uint256[] memory amounts = swapRouter.swapTokensForExactTokens(
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
            TransferHelper.safeApprove(path[0], address(swapRouter), 0);
            if (swapType == typeTokenSwap) {
                // send remaining tokens to contractCaller
                token.safeTransfer(contractCaller, amountInMaximum - amountInUsed);
            } else {
                // unwrap remaining matic and send to contractCaller
                IWMATIC(wrappedMatic).withdraw(amountInMaximum - amountInUsed); 
                payable(contractCaller).transfer(amountInMaximum - amountInUsed);
            }
        }
    }

    //function swapExactOutToV3(
    function swapExactOutAndTransfer(
        SwapHelper.ExactOutParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external { 
        require(swapParams.amountOut > relayerFee, "insufficient amountOut to pay relayer");
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");

        // peform the first swap
        _swapExactOutBeforeTransfer(
            swapParams.amountOut, 
            swapParams.amountInMaximum, 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            typeTokenSwap
        );

        // encode payload for second swap
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOut,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            typeExactOut,
            typeTokenSwap
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, swapParams.amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, swapParams.amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    } 

    //function swapExactNativeOutToV3(
    function swapExactNativeOutAndTransfer(
        SwapHelper.ExactOutParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable { 
        require(swapParams.amountOut > relayerFee, "insufficient amountOut to pay relayer");
        require(path[0]==wrappedMatic, "tokenIn must be wMATIC for first swap");
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");
        require(msg.value > 0, "must pass non 0 MATIC amount");

        // wrap MATIC
        IWMATIC(wrappedMatic).deposit{
            value : msg.value
        }();

        // peform the first swap
        _swapExactOutBeforeTransfer(
            swapParams.amountOut, 
            msg.value, // MATIC value sent in transaction is the maximumAmountIn 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            typeNativeSwap
        );

        // encode payload for second swap
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOut,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            typeExactOut,
            typeNativeSwap
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, swapParams.amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, swapParams.amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    }

    // we need to accept ETH sends to unwrap WETH
    receive() external payable {}
}