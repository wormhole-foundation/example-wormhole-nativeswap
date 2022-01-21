import { ethers } from "ethers";
import { UniEvmToken } from "./uniswap-core";
import { QuickswapRouter } from "./quickswap";
import { SingleAmmSwapRouter as UniswapV3Router } from "./uniswap-v3";
import {
  ETH_NETWORK_CHAIN_ID,
  POLYGON_NETWORK_CHAIN_ID,
} from "../utils/consts";

export { PROTOCOL as PROTOCOL_UNISWAP_V2 } from "./uniswap-v2";
export { PROTOCOL as PROTOCOL_UNISWAP_V3 } from "./uniswap-v3";

export enum QuoteType {
  ExactIn = 1,
  ExactOut,
}

function makeRouter(provider: ethers.providers.Provider, id: number) {
  switch (id) {
    case ETH_NETWORK_CHAIN_ID: {
      return new UniswapV3Router(provider);
    }
    case POLYGON_NETWORK_CHAIN_ID: {
      return new QuickswapRouter(provider);
    }
    default: {
      throw Error("unrecognized chain id");
    }
  }
}

export function getUstAddress(id: number): string {
  switch (id) {
    case ETH_NETWORK_CHAIN_ID: {
      return "0x36Ed51Afc79619b299b238898E72ce482600568a";
    }
    case POLYGON_NETWORK_CHAIN_ID: {
      return "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c";
    }
    default: {
      throw Error("unrecognized chain id");
    }
  }
}

function splitSlippageInHalf(totalSlippage: string): string {
  const divisor = ethers.FixedNumber.from("2");
  return ethers.FixedNumber.from(totalSlippage)
    .divUnsafe(divisor)
    .round(4)
    .toString();
}

interface RelayerFee {
  amount: ethers.BigNumber;
  tokenAddress: string;
}

export interface ExactInParameters {
  protocol: string;
  amountIn: ethers.BigNumber;
  minAmountOut: ethers.BigNumber;
  deadline: ethers.BigNumber;
  poolFee: string;
  path: [string, string];
}

export interface ExactInCrossParameters {
  src: ExactInParameters;
  dst: ExactInParameters;
  relayerFee: RelayerFee;
}

export interface ExactOutParameters {
  protocol: string;
  amountOut: ethers.BigNumber;
  maxAmountIn: ethers.BigNumber;
  deadline: ethers.BigNumber;
  poolFee: string;
  path: [string, string];
}

export interface ExactOutCrossParameters {
  src: ExactOutParameters;
  dst: ExactOutParameters;
  relayerFee: RelayerFee;
}

export class UniswapToUniswapQuoter {
  // providers
  srcProvider: ethers.providers.Provider;
  dstProvider: ethers.providers.Provider;

  // networks
  srcNetwork: ethers.providers.Network;
  dstNetwork: ethers.providers.Network;

  // routers
  srcRouter: UniswapV3Router | QuickswapRouter;
  dstRouter: UniswapV3Router | QuickswapRouter;

  // tokens
  srcTokenIn: UniEvmToken;
  srcTokenOut: UniEvmToken;
  dstTokenIn: UniEvmToken;
  dstTokenOut: UniEvmToken;

  constructor(
    srcProvider: ethers.providers.Provider,
    dstProvider: ethers.providers.Provider
  ) {
    this.srcProvider = srcProvider;
    this.dstProvider = dstProvider;
  }

  async initialize(): Promise<void> {
    [this.srcNetwork, this.dstNetwork] = await Promise.all([
      this.srcProvider.getNetwork(),
      this.dstProvider.getNetwork(),
    ]);

    this.srcRouter = makeRouter(this.srcProvider, this.srcNetwork.chainId);
    this.dstRouter = makeRouter(this.dstProvider, this.dstNetwork.chainId);
    return;
  }

  sameChain(): boolean {
    return this.srcNetwork.chainId === this.dstNetwork.chainId;
  }

  async makeSrcTokens(
    tokenInAddress: string
  ): Promise<[UniEvmToken, UniEvmToken]> {
    const ustOutAddress = getUstAddress(this.srcNetwork.chainId);

    const router = this.srcRouter;

    [this.srcTokenIn, this.srcTokenOut] = await Promise.all([
      router.makeToken(tokenInAddress),
      router.makeToken(ustOutAddress),
    ]);
    return [this.srcTokenIn, this.srcTokenOut];
  }

  async makeDstTokens(
    tokenOutAddress: string
  ): Promise<[UniEvmToken, UniEvmToken]> {
    const ustInAddress = getUstAddress(this.dstNetwork.chainId);

    const router = this.dstRouter;

    [this.dstTokenIn, this.dstTokenOut] = await Promise.all([
      router.makeToken(ustInAddress),
      router.makeToken(tokenOutAddress),
    ]);
    return [this.dstTokenIn, this.dstTokenOut];
  }

  async computeAndVerifySrcPoolAddress(): Promise<string> {
    return this.srcRouter.computeAndVerifyPoolAddress(
      this.srcTokenIn,
      this.srcTokenOut
    );
  }

  async computeAndVerifyDstPoolAddress(): Promise<string> {
    return this.dstRouter.computeAndVerifyPoolAddress(
      this.dstTokenIn,
      this.dstTokenOut
    );
  }

  async computeExactInParameters(
    amountIn: string,
    slippage: string,
    relayerFeeUst: string
  ): Promise<ExactInCrossParameters> {
    const singleSlippage = splitSlippageInHalf(slippage);

    // src quote
    const srcRouter = this.srcRouter;
    const srcTokenIn = this.srcTokenIn;
    const srcTokenOut = this.srcTokenOut;
    const srcMinAmountOut = await srcRouter.fetchQuoteAmountOut(
      srcTokenIn,
      srcTokenOut,
      amountIn,
      singleSlippage
    );

    // dst quote
    const dstRouter = this.dstRouter;
    const dstAmountIn = this.srcTokenOut.formatAmount(srcMinAmountOut);
    if (Number(dstAmountIn) < Number(relayerFeeUst)) {
      throw Error(
        `srcAmountOut <= relayerFeeUst. ${dstAmountIn} vs ${relayerFeeUst}`
      );
    }

    const dstTokenIn = this.dstTokenIn;
    const dstTokenOut = this.dstTokenOut;
    const dstAmountInAfterFee = dstTokenIn.subtractAmounts(
      dstAmountIn,
      relayerFeeUst
    );

    const dstMinAmountOut = await dstRouter.fetchQuoteAmountOut(
      dstTokenIn,
      dstTokenOut,
      dstAmountInAfterFee,
      singleSlippage
    );

    const srcParameters: ExactInParameters = {
      protocol: srcRouter.getProtocol(),
      amountIn: srcTokenIn.computeUnitAmount(amountIn),
      minAmountOut: srcMinAmountOut,
      poolFee: srcRouter.getPoolFee(),
      deadline: srcRouter.getTradeDeadline(),
      path: [srcTokenIn.getAddress(), srcTokenOut.getAddress()],
    };

    const dstParameters: ExactInParameters = {
      protocol: dstRouter.getProtocol(),
      amountIn: dstTokenIn.computeUnitAmount(dstAmountInAfterFee),
      minAmountOut: dstMinAmountOut,
      poolFee: dstRouter.getPoolFee(),
      deadline: dstRouter.getTradeDeadline(),
      path: [dstTokenIn.getAddress(), dstTokenOut.getAddress()],
    };

    const params: ExactInCrossParameters = {
      src: srcParameters,
      dst: dstParameters,
      relayerFee: {
        amount: dstTokenIn.computeUnitAmount(relayerFeeUst),
        tokenAddress: this.dstTokenIn.getAddress(),
      },
    };
    return params;
  }

  async computeExactOutParameters(
    amountOut: string,
    slippage: string,
    relayerFeeUst: string
  ): Promise<ExactOutCrossParameters> {
    const singleSlippage = splitSlippageInHalf(slippage);

    // dst quote first
    const dstRouter = this.dstRouter;
    const dstTokenIn = this.dstTokenIn;
    const dstTokenOut = this.dstTokenOut;
    const dstMaxAmountIn = await dstRouter.fetchQuoteAmountIn(
      dstTokenIn,
      dstTokenOut,
      amountOut,
      singleSlippage
    );

    // src quote
    const srcRouter = this.srcRouter;
    const srcAmountOut = this.dstTokenIn.formatAmount(dstMaxAmountIn);
    if (Number(srcAmountOut) < Number(relayerFeeUst)) {
      throw Error(
        `dstAmountIn <= relayerFeeUst. ${srcAmountOut} vs ${relayerFeeUst}`
      );
    }

    const srcTokenIn = this.srcTokenIn;
    const srcTokenOut = this.srcTokenOut;
    const srcAmountOutBeforeFee = srcTokenOut.addAmounts(
      srcAmountOut,
      relayerFeeUst
    );

    const srcMaxAmountIn = await srcRouter.fetchQuoteAmountIn(
      srcTokenIn,
      srcTokenOut,
      srcAmountOutBeforeFee,
      singleSlippage
    );

    const srcParameters: ExactOutParameters = {
      protocol: srcRouter.getProtocol(),
      amountOut: srcTokenOut.computeUnitAmount(srcAmountOutBeforeFee),
      maxAmountIn: srcMaxAmountIn,
      poolFee: srcRouter.getPoolFee(),
      deadline: srcRouter.getTradeDeadline(),
      path: [srcTokenIn.getAddress(), srcTokenOut.getAddress()],
    };

    const dstParameters: ExactOutParameters = {
      protocol: dstRouter.getProtocol(),
      amountOut: dstTokenOut.computeUnitAmount(amountOut),
      maxAmountIn: dstMaxAmountIn,
      poolFee: dstRouter.getPoolFee(),
      deadline: dstRouter.getTradeDeadline(),
      path: [dstTokenIn.getAddress(), dstTokenOut.getAddress()],
    };

    const params: ExactOutCrossParameters = {
      src: srcParameters,
      dst: dstParameters,
      relayerFee: {
        amount: dstTokenIn.computeUnitAmount(relayerFeeUst),
        tokenAddress: this.dstTokenIn.getAddress(),
      },
    };
    return params;
  }

  setDeadlines(deadline: string): void {
    this.srcRouter.setDeadline(deadline);
    this.dstRouter.setDeadline(deadline);
  }
}
