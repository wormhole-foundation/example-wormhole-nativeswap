//@ts-nocheck
import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import {
  ChainId,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
  CHAIN_ID_TERRA,
  getEmitterAddressEth,
  hexToUint8Array,
  nativeToHexString,
  parseSequenceFromLogEth,
  getSignedVAAWithRetry,
} from "@certusone/wormhole-sdk";
import { grpc } from "@improbable-eng/grpc-web";
import {
  PROTOCOL_UNISWAP_V2,
  // PROTOCOL_UNISWAP_V3,
  ExactInCrossParameters,
  ExactOutCrossParameters,
  QuoteType,
  UniswapToUniswapQuoter,
} from "../route/cross-quote";
import {
  TOKEN_BRIDGE_ADDRESS_ETHEREUM,
  TOKEN_BRIDGE_ADDRESS_POLYGON,
  TOKEN_BRIDGE_ADDRESS_TERRA,
  CORE_BRIDGE_ADDRESS_ETHEREUM,
  CORE_BRIDGE_ADDRESS_POLYGON,
  CORE_BRIDGE_ADDRESS_TERRA,
  WORMHOLE_RPC_HOSTS,
  //ETH_NETWORK_CHAIN_ID,
  //POLYGON_NETWORK_CHAIN_ID,
  //TERRA_NETWORK_CHAIN_ID,
  WETH_TOKEN_INFO,
  WMATIC_TOKEN_INFO,
  UST_TOKEN_INFO,
} from "../utils/consts";
import {
  CROSSCHAINSWAP_GAS_PARAMETERS,
  swapExactInFromVaaNative,
  swapExactInFromVaaToken,
  swapExactOutFromVaaNative,
  swapExactOutFromVaaToken,
} from "./util";
import { abi as SWAP_CONTRACT_V2_ABI } from "../abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../abi/contracts/CrossChainSwapV3.json";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM } from "../addresses/goerli";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON } from "../addresses/mumbai";

// placeholders
const CROSSCHAINSWAP_CONTRACT_ADDRESS_TERRA = "";

interface SwapContractParameters {
  address: string;
}

interface WormholeParameters {
  chainId: ChainId;
  coreBridgeAddress: string;
  tokenBridgeAddress: string;
}

interface ExecutionParameters {
  crossChainSwap: SwapContractParameters;
  wormhole: WormholeParameters;
}

const EXECUTION_PARAMETERS_ETHEREUM: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM,
  },
  wormhole: {
    chainId: CHAIN_ID_ETH,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_ETHEREUM,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_ETHEREUM,
  },
};

const EXECUTION_PARAMETERS_POLYGON: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON,
  },
  wormhole: {
    chainId: CHAIN_ID_POLYGON,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_POLYGON,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_POLYGON,
  },
};

const EXECUTION_PARAMETERS_TERRA: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_TERRA,
  },
  wormhole: {
    chainId: CHAIN_ID_TERRA,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_TERRA,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_TERRA,
  },
};

function makeExecutionParameters(chainId: ChainId): ExecutionParameters {
  switch (chainId) {
    case CHAIN_ID_ETH: {
      return EXECUTION_PARAMETERS_ETHEREUM;
    }
    case CHAIN_ID_POLYGON: {
      return EXECUTION_PARAMETERS_POLYGON;
    }
    case CHAIN_ID_TERRA: {
      return EXECUTION_PARAMETERS_TERRA;
    }
    default: {
      throw Error("unrecognized chain id");
    }
  }
}

async function evmApproveContractTokenSpend(
  provider: ethers.providers.Provider,
  signer: ethers.Signer,
  tokenAddress: string, //ethers.Contract,
  swapContractAddress: string,
  amount: ethers.BigNumber
): Promise<TransactionReceipt> {
  // build transaction for token spending
  const tokenContract = makeEvmToken(provider, tokenAddress).getContract();
  const unsignedTx = await tokenContract.populateTransaction.approve(
    swapContractAddress,
    amount
  );

  const address = await signer.getAddress();

  // gas calcs
  const gas_limit = "0x100000";
  const gasPrice = await signer.getGasPrice();
  const parsedGasPrice = ethers.utils.hexlify(parseInt(gasPrice.toString()));

  console.log("gettingTranscationCount", provider);

  unsignedTx.nonce = await provider.getTransactionCount(address, "latest");
  unsignedTx.gasLimit = ethers.BigNumber.from(ethers.utils.hexlify(gas_limit));
  unsignedTx.gasPrice = ethers.BigNumber.from(parsedGasPrice);
  console.log("done gettingTranscationCount");

  // sign and send transaction
  const tx = await signer.sendTransaction(unsignedTx);
  return tx.wait();
}

function makeCrossChainSwapV3Contract(
  contractAddress: string,
  provider: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(contractAddress, SWAP_CONTRACT_V3_ABI, provider);
}

function makeCrossChainSwapV2Contract(
  contractAddress: string,
  provider: ethers.providers.Provider
): ethers.Contract {
  return new ethers.Contract(contractAddress, SWAP_CONTRACT_V2_ABI, provider);
}

function makeCrossChainSwapEvmContract(
  provider: ethers.providers.Provider,
  protocol: string,
  contractAddress: string
): ethers.Contract {
  if (protocol === PROTOCOL_UNISWAP_V2) {
    return makeCrossChainSwapV2Contract(contractAddress, provider);
  } else {
    return makeCrossChainSwapV3Contract(contractAddress, provider);
  }
}

function addressToBytes32(
  address: string,
  wormholeChainId: ChainId
): Uint8Array {
  const hexString = nativeToHexString(address, wormholeChainId);
  if (hexString === null) {
    throw new Error("nativeToHexString returned null");
  }
  return hexToUint8Array(hexString);
}

async function evmApproveAndSwapExactIn(
  srcProvider: ethers.providers.Provider,
  srcWallet: ethers.Signer,
  tokenInAddress: string,
  quoteParams: ExactInCrossParameters,
  srcExecutionParams: ExecutionParameters,
  dstExecutionParams: ExecutionParameters,
  isNative: boolean
): Promise<TransactionReceipt> {
  const swapContractParams = srcExecutionParams.crossChainSwap;

  const protocol = quoteParams.src.protocol;
  const swapContract = makeCrossChainSwapEvmContract(
    srcProvider,
    protocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(srcWallet);

  // approve and swap this amount
  const amountIn = quoteParams.src.amountIn;

  const address = await srcWallet.getAddress();

  const dstWormholeChainId = dstExecutionParams.wormhole.chainId;

  const swapParams = [
    amountIn,
    quoteParams.src.minAmountOut,
    quoteParams.dst.minAmountOut,
    addressToBytes32(address, dstWormholeChainId),
    quoteParams.src.deadline,
    quoteParams.dst.poolFee || quoteParams.src.poolFee,
  ];

  const pathArray = quoteParams.src.path.concat(quoteParams.dst.path);

  const dstContractAddress = addressToBytes32(
    dstExecutionParams.crossChainSwap.address,
    dstWormholeChainId
  );
  const bridgeNonce = 69;

  // do the swap
  if (isNative) {
    const gasPlusValue = {
      value: amountIn,
      gasLimit: CROSSCHAINSWAP_GAS_PARAMETERS.gasLimit,
      maxFeePerGas: CROSSCHAINSWAP_GAS_PARAMETERS.maxFeePerGas,
      maxPriorityFeePerGas: CROSSCHAINSWAP_GAS_PARAMETERS.maxPriorityFeePerGas,
    };

    console.info("swapExactNativeInAndTransfer");
    const tx = await contractWithSigner.swapExactNativeInAndTransfer(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      gasPlusValue
    );
    return tx.wait();
  } else {
    console.info("approving contract to spend token in");
    await evmApproveContractTokenSpend(
      srcProvider,
      srcWallet,
      tokenInAddress,
      swapContract.address,
      amountIn
    );

    console.info("swapExactInAndTransfer");
    const tx = await contractWithSigner.swapExactInAndTransfer(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      CROSSCHAINSWAP_GAS_PARAMETERS
    );
    return tx.wait();
  }
}

async function evmApproveAndSwapExactOut(
  srcProvider: ethers.providers.Provider,
  srcWallet: ethers.Signer,
  tokenInAddress: string,
  quoteParams: ExactOutCrossParameters,
  srcExecutionParams: ExecutionParameters,
  dstExecutionParams: ExecutionParameters,
  isNative: boolean
): Promise<TransactionReceipt> {
  const swapContractParams = srcExecutionParams.crossChainSwap;

  const protocol = quoteParams.src.protocol;
  const swapContract = makeCrossChainSwapEvmContract(
    srcProvider,
    protocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(srcWallet);

  // approve and swap this amount
  const amountOut = quoteParams.src.amountOut;
  const maxAmountIn = quoteParams.src.maxAmountIn;

  const address = await srcWallet.getAddress();

  const dstWormholeChainId = dstExecutionParams.wormhole.chainId;

  const swapParams = [
    amountOut,
    maxAmountIn,
    quoteParams.dst.amountOut,
    addressToBytes32(address, dstWormholeChainId),
    quoteParams.src.deadline,
    quoteParams.dst.poolFee || quoteParams.src.poolFee,
  ];
  const pathArray = quoteParams.src.path.concat(quoteParams.dst.path);

  const dstContractAddress = addressToBytes32(
    dstExecutionParams.crossChainSwap.address,
    dstWormholeChainId
  );
  const bridgeNonce = 69;

  // do the swap
  if (isNative) {
    const gasPlusValue = {
      value: maxAmountIn,
      gasLimit: CROSSCHAINSWAP_GAS_PARAMETERS.gasLimit,
      maxFeePerGas: CROSSCHAINSWAP_GAS_PARAMETERS.maxFeePerGas,
      maxPriorityFeePerGas: CROSSCHAINSWAP_GAS_PARAMETERS.maxPriorityFeePerGas,
    };

    console.info("swapExactNativeOutAndTransfer");
    const tx = await contractWithSigner.swapExactNativeOutAndTransfer(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      gasPlusValue
    );
    return tx.wait();
  } else {
    console.info("approving contract to spend token in");
    await evmApproveContractTokenSpend(
      srcProvider,
      srcWallet,
      tokenInAddress,
      swapContract.address,
      maxAmountIn
    );

    console.info("swapExactOutAndTransfer");
    const tx = await contractWithSigner.swapExactOutAndTransfer(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      CROSSCHAINSWAP_GAS_PARAMETERS
    );
    return tx.wait();
  }
}

async function swapExactInFromVaa(
  dstProvider: ethers.providers.Provider,
  dstWallet: ethers.Signer,
  dstExecutionParams: ExecutionParameters,
  dstProtocol: string,
  signedVaa: Uint8Array,
  isNative: boolean
): Promise<TransactionReceipt> {
  const swapContractParams = dstExecutionParams.crossChainSwap;

  const swapContract = makeCrossChainSwapEvmContract(
    dstProvider,
    dstProtocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(dstWallet);

  if (isNative) {
    console.info("swapExactInFromVaaNative");
    return swapExactInFromVaaNative(contractWithSigner, signedVaa);
  } else {
    console.info("swapExactInFromVaaToken");
    return swapExactInFromVaaToken(contractWithSigner, signedVaa);
  }
}

async function swapExactOutFromVaa(
  dstProvider: ethers.providers.Provider,
  dstWallet: ethers.Signer,
  dstExecutionParams: ExecutionParameters,
  dstProtocol: string,
  signedVaa: Uint8Array,
  isNative: boolean
): Promise<TransactionReceipt> {
  const swapContractParams = dstExecutionParams.crossChainSwap;

  const swapContract = makeCrossChainSwapEvmContract(
    dstProvider,
    dstProtocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(dstWallet);

  if (isNative) {
    console.info("swapExactOutFromVaaNative");
    return swapExactOutFromVaaNative(contractWithSigner, signedVaa);
  } else {
    console.info("swapExactOutFromVaaToken");
    return swapExactOutFromVaaToken(contractWithSigner, signedVaa);
  }
}

interface VaaSearchParams {
  sequence: string;
  emitterAddress: string;
}

export function makeEvmProvider(tokenAddress: string) {
  switch (tokenAddress) {
    case WETH_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_GOERLI_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_GOERLI_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    case WMATIC_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_MUMBAI_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_MUMBAI_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    default: {
      console.log("huh?", tokenAddress);
      throw Error("unrecognized token address");
    }
  }
}

export class UniswapToUniswapExecutor {
  // quoting
  quoter: UniswapToUniswapQuoter;
  cachedExactInParams: ExactInCrossParameters;
  cachedExactOutParams: ExactOutCrossParameters;
  quoteType: QuoteType;
  tokens: CrossChainSwapTokens;

  // swapping
  isNative: boolean;
  slippage: string;
  relayerFeeAmount: string;
  srcExecutionParams: ExecutionParameters;
  dstExecutionParams: ExecutionParameters;

  // vaa handling
  transportFactory: grpc.TransportFactory;
  vaaSearchParams: VaaSearchParams;
  vaaBytes: Uint8Array;

  // receipts
  srcEvmReceipt: TransactionReceipt;
  dstEvmReceipt: TransactionReceipt;
  srcTerraReceipt: any;
  dstTerraReceipt: any;

  constructor() {
    this.quoter = new UniswapToUniswapQuoter();
  }

  async initialize(
    tokenInAddress: string,
    tokenOutAddress: string,
    isNative: boolean
  ): Promise<void> {
    this.isNative = isNative;

    await this.quoter.initialize(tokenInAddress, tokenOutAddress);

    // now that we have a chain id for each network, get contract info for each chain
    this.srcExecutionParams = makeExecutionParameters(
      this.quoter.getSrcChainId()
    );
    this.dstExecutionParams = makeExecutionParameters(
      this.quoter.getDstChainId()
    );
  }

  setSlippage(slippage: string): void {
    this.slippage = slippage;
  }

  setRelayerFee(amount: string): void {
    this.relayerFeeAmount = amount;
  }

  areSwapParametersUndefined(): boolean {
    return this.slippage === undefined || this.relayerFeeAmount === undefined;
  }

  setDeadlines(deadline: string): void {
    this.quoter.setDeadlines(deadline);
  }

  /*
  async makeTokens(
    tokenInAddress: string,
    tokenOutAddress: string
  ): Promise<void> {
    const quoter = this.quoter;

    const [srcTokenIn, srcTokenOut] = await quoter.makeSrcTokens(
      tokenInAddress
    );
    const [dstTokenIn, dstTokenOut] = await quoter.makeDstTokens(
      tokenOutAddress
    );

    this.tokens = {
      srcIn: srcTokenIn,
      srcOut: srcTokenOut,
      dstIn: dstTokenIn,
      dstOut: dstTokenOut,
    };
  }

  getTokens(): CrossChainSwapTokens {
    return this.tokens;
  }
*/
  async computeAndVerifySrcPoolAddress(): Promise<string> {
    return this.quoter.computeAndVerifySrcPoolAddress();
  }

  async computeAndVerifyDstPoolAddress(): Promise<string> {
    return this.quoter.computeAndVerifyDstPoolAddress();
  }

  async computeQuoteExactIn(amountIn: string): Promise<ExactInCrossParameters> {
    if (this.areSwapParametersUndefined()) {
      throw Error("undefined swap parameters");
    }

    this.cachedExactInParams = await this.quoter.computeExactInParameters(
      amountIn,
      this.slippage,
      this.relayerFeeAmount
    );
    this.quoteType = QuoteType.ExactIn;
    return this.cachedExactInParams;
  }

  async computeQuoteExactOut(
    amountOut: string
  ): Promise<ExactOutCrossParameters> {
    if (this.areSwapParametersUndefined()) {
      throw Error("undefined swap parameters");
    }

    this.cachedExactOutParams = await this.quoter.computeExactOutParameters(
      amountOut,
      this.slippage,
      this.relayerFeeAmount
    );
    this.quoteType = QuoteType.ExactOut;
    return this.cachedExactOutParams;
  }

  getSrcEvmProvider(): ethers.providers.Provider {
    return this.quoter.getSrcEvmProvider();
  }

  getDstEvmProvider(): ethers.providers.Provider {
    return this.quoter.getDstEvmProvider();
  }

  getTokenInAddress(): string {
    return this.quoter.tokenInAddress;
  }

  getTokenOutAddress(): string {
    return this.quoter.tokenOutAddress;
  }

  async evmApproveAndSwapExactIn(
    wallet: ethers.Signer
  ): Promise<TransactionReceipt> {
    return evmApproveAndSwapExactIn(
      this.getSrcEvmProvider(),
      wallet,
      this.getTokenInAddress(),
      this.cachedExactInParams,
      this.srcExecutionParams,
      this.dstExecutionParams,
      this.isNative
    );
  }

  async evmApproveAndSwapExactOut(
    wallet: ethers.Signer
  ): Promise<TransactionReceipt> {
    return evmApproveAndSwapExactOut(
      this.getSrcEvmProvider(),
      wallet,
      this.getTokenInAddress(),
      this.cachedExactOutParams,
      this.srcExecutionParams,
      this.dstExecutionParams,
      this.isNative
    );
  }

  srcIsUst(): boolean {
    return (
      this.quoter.tokenInAddress === UST_TOKEN_INFO.address &&
      this.cachedExactInParams.src === undefined
    );
  }

  async evmApproveAndSwap(wallet: ethers.Signer): Promise<TransactionReceipt> {
    const quoteType = this.quoteType;

    if (quoteType === QuoteType.ExactIn) {
      this.srcEvmReceipt = await this.evmApproveAndSwapExactIn(wallet);
    } else if (quoteType === QuoteType.ExactOut) {
      this.srcEvmReceipt = await this.evmApproveAndSwapExactOut(wallet);
    } else {
      throw Error("no quote found");
    }

    this.fetchAndSetEmitterAndSequence();
    return this.srcEvmReceipt;
  }

  fetchAndSetEmitterAndSequence(): void {
    // TODO
    return;
  }

  fetchAndSetTerraEmitterAndSequence(): void {
    // TODO
    return;
  }

  fetchAndSetEvmEmitterAndSequence(): void {
    const receipt = this.srcEvmReceipt;
    if (receipt === undefined) {
      throw Error("no swap receipt found");
    }

    const wormholeParams = this.srcExecutionParams.wormhole;

    this.vaaSearchParams = {
      sequence: parseSequenceFromLogEth(
        receipt,
        wormholeParams.coreBridgeAddress
      ),
      emitterAddress: getEmitterAddressEth(wormholeParams.tokenBridgeAddress),
    };
  }

  async fetchSignedVaaFromSwap(): Promise<void> {
    const vaaSearchParams = this.vaaSearchParams;
    if (vaaSearchParams === undefined) {
      throw Error("no vaa search params found");
    }
    const sequence = vaaSearchParams.sequence;
    const emitterAddress = vaaSearchParams.emitterAddress;
    console.info(`sequence: ${sequence}, emitterAddress: ${emitterAddress}`);
    // wait for VAA to be signed

    const vaaResponse = await getSignedVAAWithRetry(
      WORMHOLE_RPC_HOSTS,
      this.srcExecutionParams.wormhole.chainId,
      vaaSearchParams.emitterAddress,
      vaaSearchParams.sequence,
      {
        transport: this.transportFactory,
      }
    );
    // grab vaaBytes
    this.vaaBytes = vaaResponse.vaaBytes;
  }

  async fetchVaaAndSwap(wallet: ethers.Signer): Promise<TransactionReceipt> {
    await this.fetchSignedVaaFromSwap();

    // check if Terra transaction
    // TODO: change return as something else (not evm TransactionReceipt)

    const quoteType = this.quoteType;

    if (quoteType === QuoteType.ExactIn) {
      this.dstEvmReceipt = await this.evmSwapExactInFromVaa(wallet);
    } else if (quoteType === QuoteType.ExactOut) {
      this.dstEvmReceipt = await this.evmSwapExactOutFromVaa(wallet);
    } else {
      throw Error("no quote found");
    }

    return this.dstEvmReceipt;
  }

  async evmSwapExactInFromVaa(
    wallet: ethers.Signer
  ): Promise<TransactionReceipt> {
    return swapExactInFromVaa(
      this.getDstEvmProvider(),
      wallet,
      this.dstExecutionParams,
      this.cachedExactInParams.dst.protocol,
      this.vaaBytes,
      this.isNative
    );
  }

  async evmSwapExactOutFromVaa(
    wallet: ethers.Signer
  ): Promise<TransactionReceipt> {
    return swapExactOutFromVaa(
      this.getDstEvmProvider(),
      wallet,
      this.dstExecutionParams,
      this.cachedExactOutParams.dst.protocol,
      this.vaaBytes,
      this.isNative
    );
  }

  setTransport(transportFactory: grpc.TransportFactory) {
    this.transportFactory = transportFactory;
  }

  //getSwapResult(
  //  walletAddress: string,
  //  onSwapResult: (result: boolean) => void
  //) {
  //  console.log(this.cachedExactInParams.dst.protocol);
  //  console.log(this.dstExecutionParams.crossChainSwap.address);
  //  const contract = makeCrossChainSwapContract(
  //    this.getDstEvmProvider(),
  //    this.quoteType === QuoteType.ExactIn
  //      ? this.cachedExactInParams.dst.protocol
  //      : this.cachedExactOutParams.dst.protocol,
  //    this.dstExecutionParams.crossChainSwap.address
  //  );
  //  const filter = contract.filters.SwapResult(walletAddress);
  //  contract.once(
  //    filter,
  //    (recipient, tokenAddress, caller, amount, success) => {
  //      onSwapResult(success);
  //    }
  //  );
  //}
}
