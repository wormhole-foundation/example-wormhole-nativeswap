pragma solidity ^0.7.6;
pragma abicoder v2;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import 'solidity-bytes-utils/contracts/BytesLib.sol';
import './IWormhole.sol';
import './SwapHelper.sol';


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
    function completeTransferWithPayload(bytes memory encodedVm) external returns (IWormhole.VM memory);
}


contract CrossChainSwapV2 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;
    uint8 public immutable typeExactIn = 1;
    uint8 public immutable typeExactOut = 2;
    uint16 public immutable expectedVaaLength = 261;
    IUniswapV2Router02 public immutable swapRouter;
    address public immutable feeTokenAddress;
    address public immutable tokenBridgeAddress;

    constructor(address _swapRouterAddress, address _feeTokenAddress, address _tokenBridgeAddress) {
        swapRouter = IUniswapV2Router02(_swapRouterAddress);
        feeTokenAddress = _feeTokenAddress;
        tokenBridgeAddress = _tokenBridgeAddress;
    }

    function swapExactInFromV3(
        bytes calldata encodedVaa
    ) external returns (uint256[] memory amounts) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapType==typeExactIn, "swap must be type ExactIn");  

        // create dynamic address array - uniswap won't take fixed size array
        address[] memory uniPath = new address[](2);
        uniPath[0] = payload.path[0];
        uniPath[1] = payload.path[1];
        require(uniPath[0]==feeTokenAddress, "tokenIn must be UST");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 swapAmountLessFees = payload.swapAmount - payload.relayerFee;

        // approve the router to spend tokens
        TransferHelper.safeApprove(uniPath[0], address(swapRouter), swapAmountLessFees);

        // try to perform the swap
        try swapRouter.swapExactTokensForTokens(
            swapAmountLessFees,
            payload.estimatedAmount,
            uniPath,
            payload.recipientAddress, 
            payload.deadline
        ) returns (uint256[] memory amounts) {
            return amounts;
        } catch {
            // swap failed - return UST to recipient
            feeToken.safeTransfer(payload.recipientAddress, swapAmountLessFees);
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

    function swapExactInToV3(
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
            typeExactIn
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    }

    function swapExactOutFromV3(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapType==typeExactOut, "swap must be type ExactOut");
    
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
            return amountInUsed;
        } catch {
            feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees);
        }
    }

    function _swapExactOutBeforeTransfer(
        uint256 amountOut,
        uint256 amountInMaximum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline
    ) internal {
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
            token.safeTransfer(contractCaller, amountInMaximum - amountInUsed);
        }
    }

    function swapExactOutToV3(
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
            swapParams.deadline
        );

        // encode payload for second swap
        bytes memory payload = abi.encodePacked(
            swapParams.targetAmountOut,
            swapParams.targetChainRecipient,
            path[2],
            path[3],
            swapParams.deadline,
            swapParams.poolFee,
            typeExactOut
        );

        // approve token bridge to spend feeTokens (UST)
        TransferHelper.safeApprove(feeTokenAddress, tokenBridgeAddress, swapParams.amountOut);

        // send transfer with payload to the TokenBridge
        TokenBridge(tokenBridgeAddress).transferTokensWithPayload(
            feeTokenAddress, swapParams.amountOut, targetChainId, targetContractAddress, relayerFee, nonce, payload
        );
    }
}