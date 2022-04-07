import { ethers } from "ethers";

import { QuickswapRouter as MaticRouter } from "./quickswap";
import { UniswapV3Router as EthRouter } from "./uniswap-v3";
import { TerraUstTransfer as UstRouter } from "./terra-ust-transfer";
import { HurricaneswapRouter as AvaxRouter } from "./hurricaneswap";
import { PancakeswapRouter as BnbRouter } from "./pancakeswap";
import {
  ETH_TOKEN_INFO,
  MATIC_TOKEN_INFO,
  AVAX_TOKEN_INFO,
  BNB_TOKEN_INFO,
  UST_TOKEN_INFO,
  SOL_UST_TOKEN_INFO,
} from "../utils/consts";
import { addFixedAmounts, subtractFixedAmounts } from "../utils/math";
import { UstLocation } from "./generic";
import {
  ExactInParameters,
  ExactOutParameters,
  makeExactInParameters,
  makeExactOutParameters,
} from "./uniswap-core";
import {
  ChainId,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_TERRA,
  CHAIN_ID_SOLANA,
} from "@certusone/wormhole-sdk";
import { SolUstTransfer } from "./sol-ust-transfer";

export { PROTOCOL as PROTOCOL_UNISWAP_V2 } from "./uniswap-v2";
export { PROTOCOL as PROTOCOL_UNISWAP_V3 } from "./uniswap-v3";
export { PROTOCOL as PROTOCOL_TERRA_UST_TRANSFER } from "./terra-ust-transfer";

export const TERRA_UST = UST_TOKEN_INFO.address;
export const SOLANA_UST = SOL_UST_TOKEN_INFO.address;

export enum QuoteType {
  ExactIn = 1,
  ExactOut,
}

export function makeEvmProviderFromAddress(tokenAddress: string) {
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_GOERLI_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_GOERLI_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    case MATIC_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_MUMBAI_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_MUMBAI_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    case AVAX_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_FUJI_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_FUJI_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    case BNB_TOKEN_INFO.address: {
      const url = process.env.REACT_APP_BSC_PROVIDER;
      if (!url) {
        throw new Error("Could not find REACT_APP_BSC_PROVIDER");
      }
      return new ethers.providers.StaticJsonRpcProvider(url);
    }
    default: {
      throw Error("unrecognized evm token address");
    }
  }
}

export function getChainIdFromAddress(tokenAddress: string) {
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address: {
      return CHAIN_ID_ETH;
    }
    case MATIC_TOKEN_INFO.address: {
      return CHAIN_ID_POLYGON;
    }
    case AVAX_TOKEN_INFO.address: {
      return CHAIN_ID_AVAX;
    }
    case BNB_TOKEN_INFO.address: {
      return CHAIN_ID_BSC;
    }
    case UST_TOKEN_INFO.address: {
      return CHAIN_ID_TERRA;
    }
    case SOL_UST_TOKEN_INFO.address: {
      return CHAIN_ID_SOLANA;
    }
    default: {
      throw Error("unrecognized evm token address");
    }
  }
}

async function makeRouter(tokenAddress: string, loc: UstLocation) {
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address: {
      const provider = makeEvmProviderFromAddress(tokenAddress);
      const router = new EthRouter(provider);
      await router.initialize(loc);
      return router;
    }
    case MATIC_TOKEN_INFO.address: {
      const provider = makeEvmProviderFromAddress(tokenAddress);
      const router = new MaticRouter(provider);
      await router.initialize(loc);
      return router;
    }
    case AVAX_TOKEN_INFO.address: {
      const provider = makeEvmProviderFromAddress(tokenAddress);
      const router = new AvaxRouter(provider);
      await router.initialize(loc);
      return router;
    }
    case BNB_TOKEN_INFO.address: {
      const provider = makeEvmProviderFromAddress(tokenAddress);
      const router = new BnbRouter(provider);
      await router.initialize(loc);
      return router;
    }
    case UST_TOKEN_INFO.address: {
      return new UstRouter();
    }
    case SOL_UST_TOKEN_INFO.address: {
      return new SolUstTransfer();
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

export interface RelayerFee {
  amount: string;
  tokenAddress: string;
}

export interface ExactInCrossParameters {
  amountIn: string;
  ustAmountIn: string;
  minAmountOut: string;
  src: ExactInParameters | undefined;
  dst: ExactInParameters | undefined;
  relayerFee: RelayerFee;
}

export interface ExactOutCrossParameters {
  amountOut: string;
  ustAmountIn: string;
  maxAmountIn: string;
  src: ExactOutParameters | undefined;
  dst: ExactOutParameters | undefined;
  relayerFee: RelayerFee;
}

export class UniswapToUniswapQuoter {
  // tokens
  tokenInAddress: string;
  tokenOutAddress: string;

  // routers
  srcRouter: UstRouter | EthRouter | MaticRouter | AvaxRouter | BnbRouter;
  dstRouter: UstRouter | EthRouter | MaticRouter | AvaxRouter | BnbRouter;

  async initialize(tokenInAddress: string, tokenOutAddress: string) {
    if (tokenInAddress !== this.tokenInAddress) {
      this.tokenInAddress = tokenInAddress;
      this.srcRouter = await makeRouter(tokenInAddress, UstLocation.Out);
    }

    if (tokenOutAddress !== this.tokenOutAddress) {
      this.tokenOutAddress = tokenOutAddress;
      this.dstRouter = await makeRouter(tokenOutAddress, UstLocation.In);
    }
  }

  async computeAndVerifySrcPoolAddress(): Promise<string> {
    return this.srcRouter.computeAndVerifyPoolAddress();
  }

  async computeAndVerifyDstPoolAddress(): Promise<string> {
    return this.dstRouter.computeAndVerifyPoolAddress();
  }

  computeSwapSlippage(slippage: string): string {
    if (this.isSrcUst() || this.isDstUst()) {
      return slippage;
    }

    return splitSlippageInHalf(slippage);
  }

  getRelayerFee(amount: string): RelayerFee {
    if (this.isSrcUst()) {
      return {
        amount: this.srcRouter.computeUnitAmountOut(amount),
        tokenAddress: TERRA_UST, // TODO: make sure this is the right address for bridge transfer?
      };
    }

    const relayerFee: RelayerFee = {
      amount: this.srcRouter.computeUnitAmountOut(amount),
      tokenAddress: this.srcRouter.getTokenOutAddress(),
    };
    return relayerFee;
  }

  makeSrcExactInParameters(
    amountIn: string,
    minAmountOut: string
  ): ExactInParameters | undefined {
    if (this.isSrcUst()) {
      return undefined;
    }
    // @ts-ignore
    return makeExactInParameters(this.srcRouter, amountIn, minAmountOut);
  }

  makeDstExactInParameters(
    amountIn: string,
    minAmountOut: string
  ): ExactInParameters | undefined {
    if (this.isDstUst()) {
      return undefined;
    }
    // @ts-ignore
    return makeExactInParameters(this.dstRouter, amountIn, minAmountOut);
  }

  async computeExactInParameters(
    amountIn: string,
    slippage: string,
    relayerFeeUst: string
  ): Promise<ExactInCrossParameters> {
    const singleSlippage = this.computeSwapSlippage(slippage);

    // src quote
    const srcRouter = this.srcRouter;
    const srcMinAmountOut = await srcRouter.fetchExactInQuote(
      amountIn,
      singleSlippage
    );

    // dst quote
    const dstRouter = this.dstRouter;
    const dstAmountIn = srcMinAmountOut; //srcRouter.formatAmountOut(srcMinAmountOut);
    if (Number(dstAmountIn) < Number(relayerFeeUst)) {
      throw Error(
        `srcAmountOut <= relayerFeeUst. ${dstAmountIn} vs ${relayerFeeUst}`
      );
    }

    const dstAmountInAfterFee = subtractFixedAmounts(
      dstAmountIn,
      relayerFeeUst,
      dstRouter.getTokenInDecimals()
    );

    const dstMinAmountOut = await dstRouter.fetchExactInQuote(
      dstAmountInAfterFee,
      singleSlippage
    );

    // organize parameters
    const params: ExactInCrossParameters = {
      amountIn: amountIn,
      ustAmountIn: dstAmountInAfterFee,
      minAmountOut: dstMinAmountOut,
      src: this.makeSrcExactInParameters(amountIn, srcMinAmountOut),
      dst: this.makeDstExactInParameters(dstAmountInAfterFee, dstMinAmountOut),
      relayerFee: this.getRelayerFee(relayerFeeUst),
    };
    return params;
  }

  makeSrcExactOutParameters(
    amountOut: string,
    maxAmountIn: string
  ): ExactOutParameters | undefined {
    if (this.isSrcUst()) {
      return undefined;
    }
    // @ts-ignore
    return makeExactOutParameters(this.srcRouter, amountOut, maxAmountIn);
  }

  makeDstExactOutParameters(
    amountOut: string,
    maxAmountIn: string
  ): ExactOutParameters | undefined {
    if (this.isDstUst()) {
      return undefined;
    }
    // @ts-ignore
    return makeExactOutParameters(this.dstRouter, amountOut, maxAmountIn);
  }

  async computeExactOutParameters(
    amountOut: string,
    slippage: string,
    relayerFeeUst: string
  ): Promise<ExactOutCrossParameters> {
    const singleSlippage = splitSlippageInHalf(slippage);

    // dst quote first
    const dstRouter = this.dstRouter;
    const dstMaxAmountIn = await dstRouter.fetchExactOutQuote(
      amountOut,
      singleSlippage
    );

    // src quote
    const srcRouter = this.srcRouter;
    const srcAmountOut = dstMaxAmountIn;
    if (Number(srcAmountOut) < Number(relayerFeeUst)) {
      throw Error(
        `dstAmountIn <= relayerFeeUst. ${srcAmountOut} vs ${relayerFeeUst}`
      );
    }

    const srcAmountOutBeforeFee = addFixedAmounts(
      srcAmountOut,
      relayerFeeUst,
      srcRouter.getTokenOutDecimals()
    );

    const srcMaxAmountIn = await srcRouter.fetchExactOutQuote(
      srcAmountOutBeforeFee,
      singleSlippage
    );

    // organize parameters
    const params: ExactOutCrossParameters = {
      amountOut: amountOut,
      ustAmountIn: dstMaxAmountIn,
      maxAmountIn: srcMaxAmountIn,
      src: this.makeSrcExactOutParameters(
        srcAmountOutBeforeFee,
        srcMaxAmountIn
      ),
      dst: this.makeDstExactOutParameters(amountOut, dstMaxAmountIn),
      relayerFee: this.getRelayerFee(relayerFeeUst),
    };
    return params;
  }

  setDeadlines(deadline: string): void {
    if (!this.isSrcUst()) {
      // @ts-ignore
      this.srcRouter.setDeadline(deadline);
    }
    if (!this.isDstUst()) {
      // @ts-ignore
      this.dstRouter.setDeadline(deadline);
    }
  }

  isSrcUst(): boolean {
    return (
      this.tokenInAddress === TERRA_UST || this.tokenInAddress === SOLANA_UST
    );
  }

  isDstUst(): boolean {
    return (
      this.tokenOutAddress === TERRA_UST || this.tokenOutAddress === SOLANA_UST
    );
  }

  getSrcEvmProvider(): ethers.providers.Provider | undefined {
    if (this.isSrcUst()) {
      return undefined;
    }
    // @ts-ignore
    return this.srcRouter.getProvider();
  }

  getDstEvmProvider(): ethers.providers.Provider | undefined {
    if (this.isDstUst()) {
      return undefined;
    }
    // @ts-ignore
    return this.dstRouter.getProvider();
  }

  getSrcChainId(): ChainId {
    return getChainIdFromAddress(this.tokenInAddress);
  }

  getDstChainId(): ChainId {
    return getChainIdFromAddress(this.tokenOutAddress);
  }
}
