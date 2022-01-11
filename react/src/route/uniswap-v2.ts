import { ethers } from "ethers";
import { CurrencyAmount, TradeType } from "@uniswap/sdk-core";
import { abi as IUniswapV2PairABI } from "@uniswap/v2-core/build/UniswapV2Pair.json";
import { computePairAddress, Pair, Route, Trade } from "@uniswap/v2-sdk";

import { UniEvmToken, UniswapRouterCore } from "./uniswap-core";

export const PROTOCOL = "UniswapV2";

export class SingleAmmSwapRouter extends UniswapRouterCore {
  factoryAddress: string;
  pairContract: ethers.Contract;
  pair: Pair;

  setFactoryAddress(factoryAddress: string) {
    this.factoryAddress = factoryAddress;
    return;
  }

  computePoolAddress(tokenIn: UniEvmToken, tokenOut: UniEvmToken): string {
    if (this.factoryAddress === undefined) {
      throw Error("factoryAddress is undefined. use setFactoryAddress");
    }

    return computePairAddress({
      factoryAddress: this.factoryAddress,
      tokenA: tokenIn.getUniToken(),
      tokenB: tokenOut.getUniToken(),
    });
  }

  async computeAndVerifyPoolAddress(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken
  ): Promise<string> {
    const pairAddress = this.computePoolAddress(tokenIn, tokenOut);

    // verify by attempting to call factory()
    const poolContract = new ethers.Contract(
      pairAddress,
      IUniswapV2PairABI,
      this.provider
    );
    await poolContract.factory();

    return pairAddress;
  }

  async createPool(tokenIn: UniEvmToken, tokenOut: UniEvmToken): Promise<Pair> {
    const pairAddress = this.computePoolAddress(tokenIn, tokenOut);

    const pairContract = new ethers.Contract(
      pairAddress,
      IUniswapV2PairABI,
      this.provider
    );

    const [token0, reserves] = await Promise.all([
      pairContract.token0(),
      pairContract.getReserves(),
    ]);

    const reserve0 = reserves._reserve0.toString();
    const reserve1 = reserves._reserve1.toString();

    if (token0.toLowerCase() === tokenIn.getAddress().toLowerCase()) {
      return new Pair(
        CurrencyAmount.fromRawAmount(tokenIn.getUniToken(), reserve0),
        CurrencyAmount.fromRawAmount(tokenOut.getUniToken(), reserve1)
      );
    }

    return new Pair(
      CurrencyAmount.fromRawAmount(tokenOut.getUniToken(), reserve0),
      CurrencyAmount.fromRawAmount(tokenIn.getUniToken(), reserve1)
    );
  }

  async fetchQuoteAmountOut(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken,
    amountIn: string,
    slippage: string
  ): Promise<ethers.BigNumber> {
    // create pool
    const pair = await this.createPool(tokenIn, tokenOut);
    // let's get that quote

    const route = new Route(
      [pair],
      tokenIn.getUniToken(),
      tokenOut.getUniToken()
    );
    const currencyAmountIn = tokenIn.computeCurrencyAmount(amountIn);

    const quote = new Trade(route, currencyAmountIn, TradeType.EXACT_INPUT);

    const decimals = tokenOut.getDecimals();
    const minAmountOut = ethers.FixedNumber.from(
      quote.outputAmount.toSignificant(decimals)
    );

    // calculate output amount with slippage
    const slippageMultiplier = ethers.FixedNumber.from("1").subUnsafe(
      ethers.FixedNumber.from(slippage)
    );
    const minAmountOutWithSlippage = minAmountOut
      .mulUnsafe(slippageMultiplier)
      .round(decimals);

    return tokenOut.computeUnitAmount(minAmountOutWithSlippage.toString());
  }

  async fetchQuoteAmountIn(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken,
    amountOut: string,
    slippage: string
  ): Promise<ethers.BigNumber> {
    // create pool
    const pair = await this.createPool(tokenIn, tokenOut);
    // let's get that quote

    const route = new Route(
      [pair],
      tokenIn.getUniToken(),
      tokenOut.getUniToken()
    );
    const currencyAmountOut = tokenOut.computeCurrencyAmount(amountOut);

    const quote = new Trade(route, currencyAmountOut, TradeType.EXACT_OUTPUT);

    const decimals = tokenIn.getDecimals();
    const maxAmountIn = ethers.FixedNumber.from(
      quote.inputAmount.toSignificant(decimals)
    );

    const slippageDivisor = ethers.FixedNumber.from("1").subUnsafe(
      ethers.FixedNumber.from(slippage)
    );
    const maxAmountInWithSlippage = maxAmountIn
      .divUnsafe(slippageDivisor)
      .round(decimals);

    return tokenIn.computeUnitAmount(maxAmountInWithSlippage.toString());
  }

  getProtocol(): string {
    return PROTOCOL;
  }
}
