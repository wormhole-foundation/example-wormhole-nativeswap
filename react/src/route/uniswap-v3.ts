import { ethers } from "ethers";
import JSBI from "jsbi";
import { CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import {
  computePoolAddress,
  FeeAmount,
  nearestUsableTick,
  Pool,
  Route,
  TickMath,
  TICK_SPACINGS,
  Trade,
} from "@uniswap/v3-sdk";

import { UniswapRouterCore } from "./uniswap-core";
import { ETH_TOKEN_INFO } from "../utils/consts";
import { UstLocation } from "./generic";

export const PROTOCOL = "UniswapV3";

const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

export class UniswapV3Router extends UniswapRouterCore {
  poolContract: ethers.Contract;
  pool: Pool;
  poolFee: FeeAmount;

  constructor(provider: ethers.providers.Provider) {
    super(provider);

    // set fee amount for our example
    this.poolFee = FeeAmount.MEDIUM;
  }

  async initialize(ustLocation: UstLocation): Promise<void> {
    await this.initializeTokens(ETH_TOKEN_INFO, ustLocation);
    return;
  }

  getPoolFee(): string {
    return this.poolFee.toString();
  }

  computePoolAddress(): string {
    return computePoolAddress({
      factoryAddress: UNISWAP_V3_FACTORY_ADDRESS,
      fee: this.poolFee,
      tokenA: this.tokenIn.getUniToken(),
      tokenB: this.tokenOut.getUniToken(),
    });
  }

  async computeAndVerifyPoolAddress(): Promise<string> {
    const pairAddress = this.computePoolAddress();

    // verify by attempting to call factory()
    const poolContract = new ethers.Contract(
      pairAddress,
      IUniswapV3PoolABI,
      this.provider
    );
    await poolContract.factory();

    return pairAddress;
  }

  async createPool(): Promise<Pool> {
    const poolAddress = this.computePoolAddress();

    const poolContract = new ethers.Contract(
      poolAddress,
      IUniswapV3PoolABI,
      this.provider
    );
    this.poolContract = poolContract;

    const [liquidity, slot] = await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
    ]);

    // grab necessary data from slot
    const sqrtPriceX96 = slot[0];
    const tick = slot[1];

    // create JSBI version of liquidity numbers
    const bigLiq = JSBI.BigInt(liquidity);
    const negBigLiq = JSBI.multiply(bigLiq, JSBI.BigInt(-1));

    const tickConstructorArgs = [
      {
        index: nearestUsableTick(
          TickMath.MIN_TICK,
          TICK_SPACINGS[this.poolFee]
        ),
        liquidityNet: bigLiq,
        liquidityGross: bigLiq,
      },
      {
        index: nearestUsableTick(
          TickMath.MAX_TICK,
          TICK_SPACINGS[this.poolFee]
        ),
        liquidityNet: negBigLiq,
        liquidityGross: bigLiq,
      },
    ];

    return new Pool(
      this.tokenIn.getUniToken(),
      this.tokenOut.getUniToken(),
      this.poolFee,
      sqrtPriceX96.toString(), //note the description discrepancy - sqrtPriceX96 and sqrtRatioX96 are interchangable values
      liquidity,
      tick,
      tickConstructorArgs
    );
  }

  async computeTradeExactIn(
    amount: string
  ): Promise<Trade<Token, Token, TradeType.EXACT_INPUT>> {
    // create pool
    const pool = await this.createPool();

    // let's get that quote
    const tokenIn = this.tokenIn;
    const tokenOut = this.tokenOut;

    const amountIn = tokenIn.computeUnitAmount(amount);

    const route = new Route(
      [pool],
      tokenIn.getUniToken(),
      tokenOut.getUniToken()
    );
    return Trade.fromRoute(
      route,
      CurrencyAmount.fromRawAmount(tokenIn.getUniToken(), amountIn.toString()),
      TradeType.EXACT_INPUT
    );
  }

  async computeTradeExactOut(
    amount: string
  ): Promise<Trade<Token, Token, TradeType.EXACT_OUTPUT>> {
    // create pool
    const pool = await this.createPool();

    // let's get that quote
    const tokenIn = this.tokenIn;
    const tokenOut = this.tokenOut;

    const amountOut = tokenOut.computeUnitAmount(amount);

    const route = new Route(
      [pool],
      tokenIn.getUniToken(),
      tokenOut.getUniToken()
    );
    return Trade.fromRoute(
      route,
      CurrencyAmount.fromRawAmount(
        tokenOut.getUniToken(),
        amountOut.toString()
      ),
      TradeType.EXACT_OUTPUT
    );
  }

  async fetchExactInQuote(amountIn: string, slippage: string): Promise<string> {
    // get the quote
    const trade = await this.computeTradeExactIn(amountIn);

    const tokenOut = this.tokenOut;
    const decimals = tokenOut.getDecimals();

    // calculate output amount with slippage
    const minAmountOut = ethers.FixedNumber.from(
      trade.outputAmount.toSignificant(decimals)
    );

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
    // get the quote
    const trade = await this.computeTradeExactOut(amountOut);

    const tokenIn = this.tokenIn;
    const decimals = tokenIn.getDecimals();

    // calculate output amount with slippage
    const maxAmountIn = ethers.FixedNumber.from(
      trade.inputAmount.toSignificant(decimals)
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
