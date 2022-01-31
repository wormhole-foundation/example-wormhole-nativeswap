import { ethers } from "ethers";
import { CurrencyAmount, TradeType } from "@uniswap/sdk-core";
import { abi as IUniswapV2PairABI } from "@uniswap/v2-core/build/UniswapV2Pair.json";
import { computePairAddress, Pair, Route, Trade } from "@uniswap/v2-sdk";

import { UniswapRouterCore } from "./uniswap-core";

export const PROTOCOL = "UniswapV2";

// uniswap v3 (ethereum)
//export const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
//export const UNISWAP_V3_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

// quickswap (polygon)
export const QUICKSWAP_V2_ROUTER_ADDRESS =
  "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

export class UniswapV2Router extends UniswapRouterCore {
  factoryAddress: string;
  pairContract: ethers.Contract;
  pair: Pair;

  setFactoryAddress(factoryAddress: string) {
    this.factoryAddress = factoryAddress;
    return;
  }

  computePoolAddress(): string {
    if (this.factoryAddress === undefined) {
      throw Error("factoryAddress is undefined. use setFactoryAddress");
    }

    return computePairAddress({
      factoryAddress: this.factoryAddress,
      tokenA: this.tokenIn.getUniToken(),
      tokenB: this.tokenOut.getUniToken(),
    });
  }

  async computeAndVerifyPoolAddress(): Promise<string> {
    const pairAddress = this.computePoolAddress();

    // verify by attempting to call factory()
    const poolContract = new ethers.Contract(
      pairAddress,
      IUniswapV2PairABI,
      this.provider
    );
    await poolContract.factory();

    return pairAddress;
  }

  async createPool(): Promise<Pair> {
    const pairAddress = this.computePoolAddress();

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

    const tokenIn = this.tokenIn;
    const tokenOut = this.tokenOut;

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

  async fetchExactInQuote(amountIn: string, slippage: string): Promise<string> {
    // create pool
    const pair = await this.createPool();

    // let's get that quote
    const tokenIn = this.tokenIn;
    const tokenOut = this.tokenOut;

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

    /*
    return tokenOut
      .computeUnitAmount(minAmountOutWithSlippage.toString())
      .toString();
      */
    return minAmountOutWithSlippage.toString();
  }

  async fetchExactOutQuote(
    amountOut: string,
    slippage: string
  ): Promise<string> {
    // create pool
    const pair = await this.createPool();

    // let's get that quote
    const tokenIn = this.tokenIn;
    const tokenOut = this.tokenOut;

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

    /*
    return tokenIn
      .computeUnitAmount(maxAmountInWithSlippage.toString())
      .toString();
      */
    return maxAmountInWithSlippage.toString();
  }

  getProtocol(): string {
    return PROTOCOL;
  }
}
