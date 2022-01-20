pragma solidity ^0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
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

interface IWETH is IERC20 {
    function withdraw(uint amount) external;
}

interface IUniswapRouter is ISwapRouter {
    function refundETH() external payable;
}

contract CrossChainSwapV3 {
    using SafeERC20 for IERC20;
    using BytesLib for bytes;
    uint8 public immutable typeExactIn = 1;
    uint8 public immutable typeExactOut = 2;
    uint8 public immutable typeNativeSwap = 1;
    uint8 public immutable typeTokenSwap = 2;
    uint16 public immutable expectedVaaLength = 262;
    IUniswapRouter public immutable swapRouter;
    address public immutable feeTokenAddress;
    address public immutable tokenBridgeAddress;
    address public immutable wrappedEth;

    constructor(
        address _swapRouterAddress, 
        address _feeTokenAddress, 
        address _tokenBridgeAddress,
        address _wrappedEth
    ) {
        swapRouter = IUniswapRouter(_swapRouterAddress);
        feeTokenAddress = _feeTokenAddress;
        tokenBridgeAddress = _tokenBridgeAddress;
        wrappedEth = _wrappedEth;
    }

    event SwapFromV2(address indexed _recipient, address indexed _tokenOut, address indexed _from, uint256 _amountOut);

    function swapExactNativeInFromV2(
        bytes calldata encodedVaa
    ) external returns (uint256 amountOut) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapFunctionType==typeExactIn, "swap must be type ExactIn");
        require(payload.swapCurrencyType==typeNativeSwap, "swap must be native to native");
        require(payload.path[0]==feeTokenAddress, "tokenIn must be UST");
        require(payload.path[1]==wrappedEth, "tokenOut must be wETH");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 swapAmountLessFees = payload.swapAmount - payload.relayerFee;

        // approve the router to spend tokens based on amountIn
        TransferHelper.safeApprove(payload.path[0], address(swapRouter), swapAmountLessFees);
        
        // set swap options with user params
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: address(this), // send wETH to this contract, then unwrap and send to recipient
                deadline: payload.deadline,
                amountIn: swapAmountLessFees,
                amountOutMinimum: payload.estimatedAmount,
                sqrtPriceLimitX96: 0
            });

        // the call to `exactInputSingle` executes the swap
        try swapRouter.exactInputSingle(params) returns (uint256 amountOut) {
            IWETH(wrappedEth).withdraw(amountOut);
            payable(payload.recipientAddress).transfer(amountOut);
            emit SwapFromV2(payload.recipientAddress, payload.path[1], msg.sender, amountOut);
            return amountOut;
        } catch {
            // swap failed - return UST to recipient
            feeToken.safeTransfer(payload.recipientAddress, swapAmountLessFees);
            emit SwapFromV2(payload.recipientAddress, payload.path[0], msg.sender, swapAmountLessFees);
        }
    }

    function swapExactInFromV2(
        bytes calldata encodedVaa
    ) external returns (uint256 amountOut) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapFunctionType==typeExactIn, "swap must be type ExactIn");
        require(payload.swapCurrencyType==typeTokenSwap, "swap must be token to token");
        require(payload.path[0]==feeTokenAddress, "tokenIn must be UST");

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 swapAmountLessFees = payload.swapAmount - payload.relayerFee;

        // approve the router to spend tokens based on amountIn
        TransferHelper.safeApprove(payload.path[0], address(swapRouter), swapAmountLessFees);
        
        // set swap options with user params
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: payload.recipientAddress,
                deadline: payload.deadline,
                amountIn: swapAmountLessFees,
                amountOutMinimum: payload.estimatedAmount,
                sqrtPriceLimitX96: 0
            });

        // the call to `exactInputSingle` executes the swap
        try swapRouter.exactInputSingle(params) returns (uint256 amountOut) {
            emit SwapFromV2(payload.recipientAddress, payload.path[1], msg.sender, amountOut);
            return amountOut;
        } catch {
            // swap failed - return UST to recipient
            feeToken.safeTransfer(payload.recipientAddress, swapAmountLessFees);
            emit SwapFromV2(payload.recipientAddress, payload.path[0], msg.sender, swapAmountLessFees);
        }
    }

    function _swapExactInBeforeTransfer(
        uint256 amountIn,
        uint256 amountOutMinimum, 
        address contractCaller,
        address[] calldata path,
        uint256 deadline,
        uint24 poolFee
    ) internal returns (uint256 amountOut) {
        // transfer the allowed amount of tokens to this contract
        IERC20 token = IERC20(path[0]);
        token.safeTransferFrom(contractCaller, address(this), amountIn);

        // approve the router to spend tokens based on amountIn
        TransferHelper.safeApprove(path[0], address(swapRouter), amountIn);
        
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

        // the call to `exactInputSingle` executes the swap
        amountOut = swapRouter.exactInputSingle(params);
    }

    function swapExactInToV2(
        SwapHelper.ExactInParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external {  
        // makes sure the relayer is left whole after the second swap 
        require(swapParams.amountOutMinimum > relayerFee, "insufficient amountOutMinimum to pay relayer");
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");  

        // peform the first swap
        uint256 amountOut = _swapExactInBeforeTransfer(
            swapParams.amountIn, 
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            swapParams.poolFee
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

    function _swapExactNativeInBeforeTransfer(
        uint256 amountOutMinimum, 
        address contractCaller,
        address[] calldata path,
        uint256 deadline,
        uint24 poolFee
    ) public payable returns (uint256 amountOut) {
        // set swap options with user params
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: path[0],
                tokenOut: path[1],
                fee: poolFee,
                recipient: address(this),
                deadline: deadline,
                amountIn: msg.value,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            });

        // the call to `exactInputSingle` executes the swap
        amountOut = swapRouter.exactInputSingle{ value: msg.value }(params);
    }

    function swapExactNativeInToV2(
        SwapHelper.ExactInParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId,
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable {  
        require(swapParams.amountOutMinimum > relayerFee, "insufficient amountOutMinimum to pay relayer");
        require(path[0]==wrappedEth, "tokenIn must be wETH for first swap");
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap"); 
        require(msg.value > 0, "must pass non 0 ETH amount");

        // peform the first swap
        uint256 amountOut = _swapExactNativeInBeforeTransfer(
            swapParams.amountOutMinimum, 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            swapParams.poolFee
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

    function swapExactNativeOutFromV2(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapFunctionType==typeExactOut, "swap must be type ExactOut");
        require(payload.swapCurrencyType==typeNativeSwap, "swap must be token to token");
        require(payload.path[0]==feeTokenAddress, "tokenIn must be UST");
        require(payload.path[1]==wrappedEth, "tokenOut must be wETH");

        // amountOut is the estimated swap amount for exact out methods
        uint256 amountOut = payload.estimatedAmount;

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 maxAmountInLessFees = payload.swapAmount - payload.relayerFee;

        // approve the router to spend swapAmount - which is maxAmountIn in payload
        TransferHelper.safeApprove(payload.path[0], address(swapRouter), maxAmountInLessFees); 

        // set swap options with user params
        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: address(this), // send wETH to this contract, then unwrap and send to recipient
                deadline: payload.deadline,
                amountOut: amountOut,
                amountInMaximum: maxAmountInLessFees, 
                sqrtPriceLimitX96: 0
            });

        try swapRouter.exactOutputSingle(params) returns (uint256 amountInUsed) {
            // refund recipient with any UST not used in the swap
            if (amountInUsed < maxAmountInLessFees) {
                TransferHelper.safeApprove(feeTokenAddress, address(swapRouter), 0);
                feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees - amountInUsed);  
            }
            // unwrap the wETH this contract received from the swap and send to recipient
            IWETH(wrappedEth).withdraw(amountOut);
            payable(payload.recipientAddress).transfer(amountOut);
            emit SwapFromV2(payload.recipientAddress, payload.path[1], msg.sender, amountOut);
            return amountInUsed;
        } catch {
            feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees);
            emit SwapFromV2(payload.recipientAddress, payload.path[0], msg.sender, maxAmountInLessFees);
        }
    }

    function swapExactOutFromV2(
        bytes calldata encodedVaa
    ) external returns (uint256 amountInUsed) {
        // complete the transfer on the token bridge
        IWormhole.VM memory vm = TokenBridge(tokenBridgeAddress).completeTransferWithPayload(encodedVaa);
        require(vm.payload.length==expectedVaaLength, "VAA has the wrong number of bytes");

        // parse the payload 
        SwapHelper.DecodedVaaParameters memory payload = SwapHelper.decodeVaaPayload(vm);
        require(payload.swapFunctionType==typeExactOut, "swap must be type ExactOut");
        require(payload.swapCurrencyType==typeTokenSwap, "swap must be token to token");
        require(payload.path[0]==feeTokenAddress, "tokenIn must be UST");

        // amountOut is the estimated swap amount for exact out methods
        uint256 amountOut = payload.estimatedAmount;

        // pay relayer before attempting to do the swap
        // reflect payment in second swap amount
        IERC20 feeToken = IERC20(feeTokenAddress);
        feeToken.safeTransfer(msg.sender, payload.relayerFee);  
        uint256 maxAmountInLessFees = payload.swapAmount - payload.relayerFee;

        // approve the router to spend swapAmount - which is maxAmountIn in payload
        TransferHelper.safeApprove(payload.path[0], address(swapRouter), maxAmountInLessFees); 

        // set swap options with user params
        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: payload.path[0],
                tokenOut: payload.path[1],
                fee: payload.poolFee,
                recipient: payload.recipientAddress,
                deadline: payload.deadline,
                amountOut: amountOut,
                amountInMaximum: maxAmountInLessFees, 
                sqrtPriceLimitX96: 0
            });

        try swapRouter.exactOutputSingle(params) returns (uint256 amountInUsed) {
            // refund recipient with any UST not used in the swap
            if (amountInUsed < maxAmountInLessFees) {
                TransferHelper.safeApprove(feeTokenAddress, address(swapRouter), 0);
                feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees - amountInUsed);  
            }
            emit SwapFromV2(payload.recipientAddress, payload.path[1], msg.sender, amountOut);
            return amountInUsed;
        } catch {
             feeToken.safeTransfer(payload.recipientAddress, maxAmountInLessFees);
            emit SwapFromV2(payload.recipientAddress, payload.path[0], msg.sender, maxAmountInLessFees);
        }
    }

    function _swapExactOutBeforeTransfer(
        uint256 amountOut, 
        uint256 amountInMaximum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline,
        uint24 poolFee
    ) internal {
        // transfer the allowed amount of tokens to this contract
        IERC20 token = IERC20(path[0]);
        token.safeTransferFrom(contractCaller, address(this), amountInMaximum);

        // approve the router to spend the specifed amountInMaximum of tokens
        TransferHelper.safeApprove(path[0], address(swapRouter), amountInMaximum);

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

        // executes the swap returning the amountIn needed to spend to receive the desired amountOut
        uint256 amountInUsed = swapRouter.exactOutputSingle(params);

        // refund contractCaller with any amountIn that's not spent
        if (amountInUsed < amountInMaximum) {
            TransferHelper.safeApprove(path[0], address(swapRouter), 0);
            token.safeTransfer(contractCaller, amountInMaximum - amountInUsed);
        }
    }

    function swapExactOutToV2(
        SwapHelper.ExactOutParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId, // make sure target contract address belongs to targeChainId
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
            swapParams.poolFee
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

    function _swapExactNativeOutBeforeTransfer(
        uint256 amountOut, 
        uint256 amountInMaximum,
        address contractCaller,
        address[] calldata path,
        uint256 deadline,
        uint24 poolFee
    ) public payable {
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

        // executes the swap returning the amountIn needed to spend to receive the desired amountOut
        uint256 amountInUsed = swapRouter.exactOutputSingle{ value: amountInMaximum }(params);
        
        // ask for our money back -_-
        swapRouter.refundETH();

        // refund contractCaller with any amountIn that's not spent
        if (amountInUsed < amountInMaximum) {
            TransferHelper.safeApprove(path[0], address(swapRouter), 0);
            // refund contractCaller with unused ether 
            payable(contractCaller).transfer(amountInMaximum - amountInUsed);
        }
    }

    function swapExactNativeOutToV2(
        SwapHelper.ExactOutParameters calldata swapParams,
        address[] calldata path,
        uint256 relayerFee,
        uint16 targetChainId, // make sure target contract address belongs to targeChainId
        bytes32 targetContractAddress,
        uint32 nonce
    ) external payable {  
        require(swapParams.amountOut > relayerFee, "insufficient amountOut to pay relayer");
        require(path[0]==wrappedEth, "tokenIn must be wETH for first swap");
        require(path[1]==feeTokenAddress, "tokenOut must be UST for first swap");
        require(msg.value > 0, "must pass non 0 ETH amount");

        // peform the first swap
        _swapExactNativeOutBeforeTransfer(
            swapParams.amountOut, 
            msg.value, // ETH value sent in transaction is the maximumAmountIn 
            msg.sender,
            path[0:2], 
            swapParams.deadline,
            swapParams.poolFee
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