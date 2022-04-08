//@ts-nocheck
import {
  ChainId,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
  CHAIN_ID_SOLANA,
  CHAIN_ID_TERRA,
  getEmitterAddressEth,
  getSignedVAAWithRetry,
  hexToUint8Array,
  nativeToHexString,
  parseSequenceFromLogEth,
} from "@certusone/wormhole-sdk";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { grpc } from "@improbable-eng/grpc-web";
import { ethers } from "ethers";
import { abi as SWAP_CONTRACT_V2_ABI } from "../abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../abi/contracts/CrossChainSwapV3.json";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_BSC } from "../addresses/bsc";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_AVALANCHE } from "../addresses/fuji";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM } from "../addresses/goerli";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON } from "../addresses/mumbai";
import {
  // PROTOCOL_UNISWAP_V3,
  ExactInCrossParameters,
  ExactOutCrossParameters,
  PROTOCOL_UNISWAP_V2,
  QuoteType,
  UniswapToUniswapQuoter,
} from "../route/cross-quote";
import { makeErc20Contract } from "../route/evm";
import {
  CORE_BRIDGE_ADDRESS_AVALANCHE,
  CORE_BRIDGE_ADDRESS_BSC,
  CORE_BRIDGE_ADDRESS_ETHEREUM,
  CORE_BRIDGE_ADDRESS_POLYGON,
  CORE_BRIDGE_ADDRESS_SOLANA,
  CORE_BRIDGE_ADDRESS_TERRA,
  TOKEN_BRIDGE_ADDRESS_AVALANCHE,
  TOKEN_BRIDGE_ADDRESS_BSC,
  TOKEN_BRIDGE_ADDRESS_ETHEREUM,
  TOKEN_BRIDGE_ADDRESS_POLYGON,
  TOKEN_BRIDGE_ADDRESS_SOLANA,
  TOKEN_BRIDGE_ADDRESS_TERRA,
  //ETH_NETWORK_CHAIN_ID,
  //POLYGON_NETWORK_CHAIN_ID,
  //TERRA_NETWORK_CHAIN_ID,
  UST_TOKEN_INFO,
  WORMHOLE_RPC_HOSTS,
} from "../utils/consts";
import {
  evmSwapExactInFromVaaNative,
  evmSwapExactInFromVaaToken,
  evmSwapExactOutFromVaaNative,
  evmSwapExactOutFromVaaToken,
  getEvmGasParametersForContract,
} from "./helpers";

// placeholders
const CROSSCHAINSWAP_CONTRACT_ADDRESS_TERRA =
  "terra163shc8unyqrndgcldaj2q9kgnqs82v0kgkhynf";
export const CROSSCHAINSWAP_CONTRACT_ADDRESS_SOLANA =
  "Gz69mECJ3xj6pNYQQMV9fTLc4RrBxD5gh6F56eKVZdD8"; // Custody Signer for NativeSwap Program

function makeNullSwapPath(): any[] {
  const zeroBuffer = Buffer.alloc(20);
  const nullAddress = "0x" + zeroBuffer.toString("hex");
  return [nullAddress, nullAddress];
}

const NULL_SWAP_PATH = makeNullSwapPath();

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

const EXECUTION_PARAMETERS_AVALANCHE: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_AVALANCHE,
  },
  wormhole: {
    chainId: CHAIN_ID_AVAX,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_AVALANCHE,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_AVALANCHE,
  },
};

const EXECUTION_PARAMETERS_BSC: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_BSC,
  },
  wormhole: {
    chainId: CHAIN_ID_BSC,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_BSC,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_BSC,
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

const EXECUTION_PARAMETERS_SOLANA: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_SOLANA,
  },
  wormhole: {
    chainId: CHAIN_ID_SOLANA,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_SOLANA,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_SOLANA,
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
    case CHAIN_ID_AVAX: {
      return EXECUTION_PARAMETERS_AVALANCHE;
    }
    case CHAIN_ID_BSC: {
      return EXECUTION_PARAMETERS_BSC;
    }
    case CHAIN_ID_TERRA: {
      return EXECUTION_PARAMETERS_TERRA;
    }
    case CHAIN_ID_SOLANA: {
      return EXECUTION_PARAMETERS_SOLANA;
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
  const tokenContract = await makeErc20Contract(provider, tokenAddress);
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

function evmMakeExactInSwapParameters(
  amountIn: ethers.BigNumber,
  recipientAddress: string,
  dstWormholeChainId: ChainId,
  quoteParams: ExactInCrossParameters
): any[] {
  const src = quoteParams.src;
  const dst = quoteParams.dst;

  if (dst === undefined) {
    return [
      amountIn,
      src.minAmountOut,
      0,
      addressToBytes32(recipientAddress, dstWormholeChainId),
      src.deadline,
      src.poolFee || 0,
    ];
  }

  return [
    amountIn,
    src.minAmountOut,
    dst.minAmountOut,
    addressToBytes32(recipientAddress, dstWormholeChainId),
    src.deadline,
    dst.poolFee || src.poolFee || 0,
  ];
}

function makePathArray(
  quoteParams: ExactInCrossParameters | ExactOutCrossParameters
): any[] {
  if (quoteParams.src === undefined) {
    return NULL_SWAP_PATH.concat(quoteParams.dst.path);
  } else if (quoteParams.dst === undefined) {
    return quoteParams.src.path.concat(NULL_SWAP_PATH);
  } else {
    return quoteParams.src.path.concat(quoteParams.dst.path);
  }
}

async function evmApproveAndSwapExactIn(
  srcProvider: ethers.providers.Provider,
  srcWallet: ethers.Signer,
  tokenInAddress: string,
  quoteParams: ExactInCrossParameters,
  srcExecutionParams: ExecutionParameters,
  dstExecutionParams: ExecutionParameters,
  isNative: boolean,
  recipientAddress: string
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
  const dstWormholeChainId = dstExecutionParams.wormhole.chainId;

  const swapParams = evmMakeExactInSwapParameters(
    amountIn,
    recipientAddress,
    dstWormholeChainId,
    quoteParams
  );

  const pathArray = makePathArray(quoteParams);

  const dstContractAddress = addressToBytes32(
    dstExecutionParams.crossChainSwap.address,
    dstWormholeChainId
  );
  const bridgeNonce = 69;

  const gasParams = getEvmGasParametersForContract(swapContract);
  // do the swap
  if (isNative) {
    const transactionParams = { value: amountIn, ...gasParams };

    console.info("swapExactNativeInAndTransfer");
    const tx = await contractWithSigner.swapExactNativeInAndTransfer(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      transactionParams
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
      gasParams
    );
    return tx.wait();
  }
}

// TODO: fix to resemble ExactIn
async function evmApproveAndSwapExactOut(
  srcProvider: ethers.providers.Provider,
  srcWallet: ethers.Signer,
  tokenInAddress: string,
  quoteParams: ExactOutCrossParameters,
  srcExecutionParams: ExecutionParameters,
  dstExecutionParams: ExecutionParameters,
  isNative: boolean,
  recipientAddress: string
): Promise<TransactionReceipt> {
  const swapContractParams = srcExecutionParams.crossChainSwap;

  const protocol = quoteParams.src?.protocol;
  const swapContract = makeCrossChainSwapEvmContract(
    srcProvider,
    protocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(srcWallet);

  // approve and swap this amount
  const amountOut = quoteParams.src?.amountOut;
  const maxAmountIn = quoteParams.src?.maxAmountIn;
  const dstWormholeChainId = dstExecutionParams.wormhole.chainId;

  const swapParams = [
    amountOut,
    maxAmountIn,
    quoteParams.dst.amountOut,
    addressToBytes32(recipientAddress, dstWormholeChainId),
    quoteParams.src.deadline,
    quoteParams.dst.poolFee || quoteParams.src.poolFee || 0,
  ];
  const pathArray = makePathArray(quoteParams);

  const dstContractAddress = addressToBytes32(
    dstExecutionParams.crossChainSwap.address,
    dstWormholeChainId
  );
  const bridgeNonce = 69;

  const gasParams = getEvmGasParametersForContract(swapContract);
  // do the swap
  if (isNative) {
    const gasPlusValue = { value: maxAmountIn, ...gasParams };

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
      gasParams
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
    console.info("evmSwapExactInFromVaaNative");
    return evmSwapExactInFromVaaNative(contractWithSigner, signedVaa);
  } else {
    console.info("evmSwapExactInFromVaaToken");
    return evmSwapExactInFromVaaToken(contractWithSigner, signedVaa);
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
    console.info("evmSwapExactOutFromVaaNative");
    return evmSwapExactOutFromVaaNative(contractWithSigner, signedVaa);
  } else {
    console.info("evmSwapExactOutFromVaaToken");
    return evmSwapExactOutFromVaaToken(contractWithSigner, signedVaa);
  }
}

interface VaaSearchParams {
  sequence: string;
  emitterAddress: string;
}

export function makeEvmProvider(tokenAddress: string) {
  let url;
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address:
      url = process.env.REACT_APP_GOERLI_PROVIDER;
      if (!url) throw new Error("REACT_APP_GOERLI_PROVIDER not set");
      break;
    case MATIC_TOKEN_INFO.address:
      url = process.env.REACT_APP_MUMBAI_PROVIDER;
      if (!url) throw new Error("REACT_APP_MUMBAI_PROVIDER not set");
      break;
    case AVAX_TOKEN_INFO.address:
      url = process.env.REACT_APP_FUJI_PROVIDER;
      if (!url) throw new Error("REACT_APP_FUJI_PROVIDER not set");
      break;
    case BSC_TOKEN_INFO.address:
      url = process.env.REACT_APP_BSC_PROVIDER;
      if (!url) throw new Error("REACT_APP_BSC_PROVIDER not set");
      break;
    default:
      throw Error("unrecognized token address");
  }
  return new ethers.providers.StaticJsonRpcProvider(url);
}

export class UniswapToUniswapExecutor {
  // quoting
  quoter: UniswapToUniswapQuoter;
  cachedExactInParams: ExactInCrossParameters;
  cachedExactOutParams: ExactOutCrossParameters;
  quoteType: QuoteType;

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
    srcWallet: ethers.Signer,
    recipientAddress: string
  ): Promise<TransactionReceipt> {
    return evmApproveAndSwapExactIn(
      this.getSrcEvmProvider(),
      srcWallet,
      this.getTokenInAddress(),
      this.cachedExactInParams,
      this.srcExecutionParams,
      this.dstExecutionParams,
      this.isNative,
      recipientAddress
    );
  }

  async evmApproveAndSwapExactOut(
    srcWallet: ethers.Signer,
    recipientAddress: string
  ): Promise<TransactionReceipt> {
    return evmApproveAndSwapExactOut(
      this.getSrcEvmProvider(),
      srcWallet,
      this.getTokenInAddress(),
      this.cachedExactOutParams,
      this.srcExecutionParams,
      this.dstExecutionParams,
      this.isNative,
      recipientAddress
    );
  }

  srcIsUst(): boolean {
    return (
      this.quoter.tokenInAddress === UST_TOKEN_INFO.address &&
      this.cachedExactInParams.src === undefined
    );
  }

  async evmApproveAndSwap(
    wallet: ethers.Signer,
    recipientAddress: string
  ): Promise<TransactionReceipt> {
    const quoteType = this.quoteType;

    if (quoteType === QuoteType.ExactIn) {
      this.srcEvmReceipt = await this.evmApproveAndSwapExactIn(
        wallet,
        recipientAddress
      );
    } else if (quoteType === QuoteType.ExactOut) {
      this.srcEvmReceipt = await this.evmApproveAndSwapExactOut(
        wallet,
        recipientAddress
      );
    } else {
      throw Error("no quote found");
    }

    this.fetchAndSetEvmEmitterAndSequence();
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
