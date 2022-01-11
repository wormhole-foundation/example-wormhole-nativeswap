//@ts-nocheck
import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import {
  CHAIN_ID_POLYGON as WORMHOLE_CHAIN_ID_POLYGON,
  CHAIN_ID_ETH as WORMHOLE_CHAIN_ID_ETHEREUM,
  ChainId,
  getEmitterAddressEth,
  hexToUint8Array,
  nativeToHexString,
  parseSequenceFromLogEth,
  getSignedVAAWithRetry,
} from "@certusone/wormhole-sdk";
import { grpc } from "@improbable-eng/grpc-web";
import { UniEvmToken } from "../route/uniswap-core";
import {
  PROTOCOL_UNISWAP_V2,
  PROTOCOL_UNISWAP_V3,
  ExactInCrossParameters,
  ExactOutCrossParameters,
  QuoteType,
  UniswapToUniswapQuoter,
} from "../route/cross-quote";
import {
  TOKEN_BRIDGE_ADDRESS_POLYGON,
  CORE_BRIDGE_ADDRESS_ETHEREUM,
  CORE_BRIDGE_ADDRESS_POLYGON,
  TOKEN_BRIDGE_ADDRESS_ETHEREUM,
  WORMHOLE_RPC_HOSTS,
  POLYGON_NETWORK_CHAIN_ID,
  ETH_NETWORK_CHAIN_ID,
  WETH_TOKEN_INFO,
  WMATIC_TOKEN_INFO,
} from "../utils/consts";
import { abi as SWAP_CONTRACT_V2_ABI } from "../abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../abi/contracts/CrossChainSwapV3.json";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM } from "../addresses/goerli";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON } from "../addresses/mumbai";

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
    chainId: WORMHOLE_CHAIN_ID_ETHEREUM,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_ETHEREUM,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_ETHEREUM,
  },
};

const EXECUTION_PARAMETERS_POLYGON: ExecutionParameters = {
  crossChainSwap: {
    address: CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON,
  },
  wormhole: {
    chainId: WORMHOLE_CHAIN_ID_POLYGON,
    coreBridgeAddress: CORE_BRIDGE_ADDRESS_POLYGON,
    tokenBridgeAddress: TOKEN_BRIDGE_ADDRESS_POLYGON,
  },
};

const CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3 = {
  gasLimit: "550000",
  maxFeePerGas: "250000000000",
  maxPriorityFeePerGas: "1690000000",
};

const CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2 = {
  gasLimit: "350000",
  maxFeePerGas: "250000000000",
  maxPriorityFeePerGas: "1690000000",
};

function makeExecutionParameters(id: number): ExecutionParameters {
  switch (id) {
    case ETH_NETWORK_CHAIN_ID: {
      return EXECUTION_PARAMETERS_ETHEREUM;
    }
    case POLYGON_NETWORK_CHAIN_ID: {
      return EXECUTION_PARAMETERS_POLYGON;
    }
    default: {
      throw Error("unrecognized chain id");
    }
  }
}

async function approveContractTokenSpend(
  provider: ethers.providers.Provider,
  signer: ethers.Signer,
  tokenContract: ethers.Contract,
  swapContractAddress: string,
  amount: ethers.BigNumber
): Promise<TransactionReceipt> {
  // build transaction for token spending
  const unsignedTx = await tokenContract.populateTransaction.approve(
    swapContractAddress,
    amount
  );

  // TODO: pass this in?
  const address = await signer.getAddress();
  console.log("address", address);

  console.log("signer", signer);

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

function makeCrossChainSwapContract(
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
  return hexToUint8Array(nativeToHexString(address, wormholeChainId));
}

async function approveAndSwapExactIn(
  srcProvider: ethers.providers.Provider,
  srcWallet: ethers.Signer,
  srcTokenIn: UniEvmToken,
  quoteParams: ExactInCrossParameters,
  srcExecutionParams: ExecutionParameters,
  dstExecutionParams: ExecutionParameters
): Promise<TransactionReceipt> {
  const swapContractParams = srcExecutionParams.crossChainSwap;

  const protocol = quoteParams.src.protocol;
  const swapContract = makeCrossChainSwapContract(
    srcProvider,
    protocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(srcWallet);

  // approve and swap this amount
  const amountIn = quoteParams.src.amountIn;

  // approve swap contract to spend our tokens
  console.info("approving contract to spend token in");
  await approveContractTokenSpend(
    srcProvider,
    srcWallet,
    srcTokenIn.getContract(),
    swapContract.address,
    amountIn
  );

  const address = await srcWallet.getAddress();

  const swapParams = [
    amountIn,
    quoteParams.src.minAmountOut,
    quoteParams.dst.minAmountOut,
    // srcWallet.address,
    address,
    quoteParams.src.deadline,
    quoteParams.dst.poolFee || quoteParams.src.poolFee,
  ];

  const pathArray = quoteParams.src.path.concat(quoteParams.dst.path);

  const dstWormholeChainId = dstExecutionParams.wormhole.chainId;
  const dstContractAddress = addressToBytes32(
    dstExecutionParams.crossChainSwap.address,
    dstWormholeChainId
  );
  const bridgeNonce = 69;

  // do the swap
  if (protocol === PROTOCOL_UNISWAP_V2) {
    console.info("swapExactInToV3");
    const tx = await contractWithSigner.swapExactInToV3(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
    );
    return tx.wait();
  } else {
    console.info("swapExactInToV2");
    const tx = await contractWithSigner.swapExactInToV2(
      swapParams,
      pathArray,
      quoteParams.relayerFee.amount,
      dstWormholeChainId,
      dstContractAddress,
      bridgeNonce,
      CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
    );
    return tx.wait();
  }
}

async function swapExactInFromVaa(
  dstProvider: ethers.providers.Provider,
  dstWallet: ethers.Signer,
  dstExecutionParams: ExecutionParameters,
  dstProtocol: string,
  signedVAA: Uint8Array
): Promise<TransactionReceipt> {
  const swapContractParams = dstExecutionParams.crossChainSwap;

  const swapContract = makeCrossChainSwapContract(
    dstProvider,
    dstProtocol,
    swapContractParams.address
  );
  const contractWithSigner = swapContract.connect(dstWallet);

  if (dstProtocol === PROTOCOL_UNISWAP_V3) {
    console.info("swapExactInFromV2");
    const tx = await contractWithSigner.swapExactInFromV2(
      signedVAA,
      CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
    );
    return tx.wait();
  } else {
    console.info("swapExactInFromV3");
    const tx = await contractWithSigner.swapExactInFromV3(
      signedVAA,
      CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
    );
    return tx.wait();
  }
}

interface CrossChainSwapTokens {
  srcIn: UniEvmToken;
  srcOut: UniEvmToken;
  dstIn: UniEvmToken;
  dstOut: UniEvmToken;
}

interface VaaSearchParams {
  sequence: string;
  emitterAddress: string;
}

export function makeProvider(tokenAddress: string) {
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
  slippage: string;
  relayerFeeAmount: string;
  srcExecutionParams: ExecutionParameters;
  dstExecutionParams: ExecutionParameters;

  // vaa handling
  transportFactory: grpc.TransportFactory;
  vaaSearchParams: VaaSearchParams;
  vaaBytes: Uint8Array;
  srcReceipt: TransactionReceipt;
  dstReceipt: TransactionReceipt;

  async initialize(
    tokenInAddress: string,
    tokenOutAddress: string
  ): Promise<void> {
    this.clearState();

    const srcProvider = makeProvider(tokenInAddress);
    const dstProvider = makeProvider(tokenOutAddress);

    this.quoter = new UniswapToUniswapQuoter(srcProvider, dstProvider);
    await this.quoter.initialize();

    await this.makeTokens(tokenInAddress, tokenOutAddress);

    // now that we have a chain id for each network, get contract info for each chain
    this.srcExecutionParams = makeExecutionParameters(
      this.quoter.srcNetwork.chainId
    );
    this.dstExecutionParams = makeExecutionParameters(
      this.quoter.dstNetwork.chainId
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

    this.clearCachedParams();

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

    this.clearCachedParams();

    this.cachedExactOutParams = await this.quoter.computeExactOutParameters(
      amountOut,
      this.slippage,
      this.relayerFeeAmount
    );
    this.quoteType = QuoteType.ExactOut;
    return this.cachedExactOutParams;
  }

  clearCachedParams(): void {
    this.cachedExactInParams = undefined;
    this.cachedExactOutParams = undefined;
    this.quoteType = undefined;
  }

  getSrcProvider(): ethers.providers.Provider {
    return this.quoter.srcProvider;
  }

  getDstProvider(): ethers.providers.Provider {
    return this.quoter.dstProvider;
  }

  async approveAndSwapExactIn(
    wallet: ethers.Signer
  ): Promise<TransactionReceipt> {
    return approveAndSwapExactIn(
      this.getSrcProvider(),
      wallet,
      this.tokens.srcIn,
      this.cachedExactInParams,
      this.srcExecutionParams,
      this.dstExecutionParams
    );
  }

  async approveAndSwapExactOut(
    wallet: ethers.Wallet
  ): Promise<TransactionReceipt> {
    throw Error("ExactOut not supported yet");
  }

  async approveAndSwap(wallet: ethers.Signer): Promise<TransactionReceipt> {
    const quoteType = this.quoteType;

    if (quoteType === QuoteType.ExactIn) {
      this.srcReceipt = await this.approveAndSwapExactIn(wallet);
    } else if (quoteType === QuoteType.ExactOut) {
      this.srcReceipt = await this.approveAndSwapExactOut(wallet);
    } else {
      throw Error("no quote found");
    }

    this.fetchAndSetEmitterAndSequence();
    return this.srcReceipt;
  }

  fetchAndSetEmitterAndSequence(): void {
    const receipt = this.srcReceipt;
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
    return;
  }

  async fetchSignedVaaFromSwap(): Promise<void> {
    if (this.vaaBytes !== undefined) {
      //   console.warn("vaaBytes are defined");
      return;
    }
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
      vaaSearchParams.sequence
      // TODO: this is where we passed the transport
    );
    // grab vaaBytes
    this.vaaBytes = vaaResponse.vaaBytes;
    return;
  }

  async fetchVaaAndSwap(wallet: ethers.Signer): Promise<TransactionReceipt> {
    await this.fetchSignedVaaFromSwap();

    const quoteType = this.quoteType;

    if (quoteType === QuoteType.ExactIn) {
      this.dstReceipt = await this.swapExactInFromVaa(wallet);
    } else if (quoteType === QuoteType.ExactOut) {
      this.dstReceipt = await this.swapExactOutFromVaa(wallet);
    } else {
      throw Error("no quote found");
    }

    // console.info("clearing state");
    this.clearState();

    return this.dstReceipt;
  }

  async swapExactInFromVaa(wallet: ethers.Signer): Promise<TransactionReceipt> {
    return swapExactInFromVaa(
      this.getDstProvider(),
      wallet,
      this.dstExecutionParams,
      this.cachedExactInParams.dst.protocol,
      this.vaaBytes
    );
  }

  async swapExactOutFromVaa(
    wallet: ethers.Wallet
  ): Promise<TransactionReceipt> {
    throw Error("ExactOut not supported yet");
  }

  clearState(): void {
    // TODO: after the whole swap, clear the state of everything
    this.vaaBytes = undefined;

    // clear src receipt only
    this.srcReceipt = undefined;

    // clear params
    this.cachedExactInParams = undefined;
    this.cachedExactOutParams = undefined;
    this.quoteType = undefined;
    return;
  }
}
