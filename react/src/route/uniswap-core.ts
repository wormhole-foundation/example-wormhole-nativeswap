//@ts-nocheck
import { ethers } from "ethers";
import { CurrencyAmount, Token } from "@uniswap/sdk-core";

import { EvmToken } from "./evm";
import { RouterCore, UstLocation } from "./generic";
import { TokenInfo } from "../utils/consts";

export function computeTradeDeadline(deadline: string): ethers.BigNumber {
  return ethers.BigNumber.from(Math.floor(Date.now() / 1000)).add(deadline);
}

export class UniEvmToken {
  erc20: EvmToken;
  uniToken: Token;

  constructor(chainId: number, erc20: EvmToken) {
    this.erc20 = erc20;

    const address = this.getAddress();
    const decimals = this.getDecimals();

    this.uniToken = new Token(chainId, address, decimals);
  }

  getUniToken(): Token {
    return this.uniToken;
  }

  getEvmToken(): EvmToken {
    return this.erc20;
  }

  getDecimals(): number {
    return this.erc20.getDecimals();
  }

  getContract(): ethers.Contract {
    return this.erc20.getContract();
  }

  getAddress(): string {
    return this.erc20.getAddress();
  }

  async getBalanceOf(signer: ethers.Wallet) {
    return this.erc20.getBalanceOf(signer);
  }

  computeUnitAmount(amount: string): ethers.BigNumber {
    return this.erc20.computeUnitAmount(amount);
  }

  formatAmount(unitAmount: ethers.BigNumber): string {
    return this.erc20.formatAmount(unitAmount);
  }

  computeCurrencyAmount(amount: string): CurrencyAmount<Token> {
    const unitAmount = this.computeUnitAmount(amount);
    return CurrencyAmount.fromRawAmount(
      this.getUniToken(),
      unitAmount.toString()
    );
  }

  addAmounts(left: string, right: string): string {
    return this.erc20.addAmounts(left, right);
  }

  subtractAmounts(left: string, right: string): string {
    return this.erc20.subtractAmounts(left, right);
  }
}

export async function makeUniEvmToken(
  provider: ethers.providers.Provider,
  chainId: number,
  tokenAddress: string
): Promise<UniEvmToken> {
  const erc20 = await EvmToken.create(provider, tokenAddress);
  return new UniEvmToken(chainId, erc20);
}

function stringToBigNumber(value: string): ethers.BigNumber {
  return ethers.BigNumber.from(value);
}

export interface ExactInParameters {
  protocol: string;
  amountIn: ethers.BigNumber;
  minAmountOut: ethers.BigNumber;
  deadline: ethers.BigNumber;
  poolFee: string;
  path: [string, string];
}

export interface ExactOutParameters {
  protocol: string;
  amountOut: ethers.BigNumber;
  maxAmountIn: ethers.BigNumber;
  deadline: ethers.BigNumber;
  poolFee: string;
  path: [string, string];
}

export function makeExactInParameters(
  router: UniswapRouterCore,
  amountIn: string,
  minAmountOut: string
): ExactInParameters {
  const params: ExactInParameters = {
    protocol: router.getProtocol(),
    amountIn: router.tokenIn.computeUnitAmount(amountIn),
    minAmountOut: router.tokenOut.computeUnitAmount(minAmountOut),
    poolFee: router.getPoolFee(),
    deadline: router.getTradeDeadline(),
    path: [router.tokenIn.getAddress(), router.tokenOut.getAddress()],
  };
  return params;
}

export function makeExactOutParameters(
  router: UniswapRouterCore,
  amountOut: string,
  maxAmountIn: string
): ExactOutParameters {
  const params: ExactOutParameters = {
    protocol: router.getProtocol(),
    amountOut: router.tokenOut.computeUnitAmount(amountOut),
    maxAmountIn: router.tokenIn.computeUnitAmount(maxAmountIn),
    poolFee: router.getPoolFee(),
    deadline: router.getTradeDeadline(),
    path: [router.tokenIn.getAddress(), router.tokenOut.getAddress()],
  };
  return params;
}

export abstract class UniswapRouterCore extends RouterCore {
  provider: ethers.providers.Provider;
  network: ethers.providers.Network;

  // wormhole
  chainId: number;

  // tokens
  tokenIn: UniEvmToken;
  tokenOut: UniEvmToken;

  // params
  deadline: string = "";

  constructor(provider: ethers.providers.Provider) {
    super();
    this.provider = provider;
  }

  public getProvider(): ethers.providers.Provider {
    return this.provider;
  }

  public async initializeTokens(
    tokenInfo: TokenInfo,
    ustLocation: UstLocation
  ): Promise<void> {
    this.network = await this.provider.getNetwork();

    const network = this.network;

    if (ustLocation == UstLocation.Out) {
      [this.tokenIn, this.tokenOut] = await Promise.all([
        makeUniEvmToken(this.provider, network.chainId, tokenInfo.address),
        makeUniEvmToken(
          this.provider,
          network.chainId,
          tokenInfo.ustPairedAddress
        ),
      ]);
    } else {
      [this.tokenIn, this.tokenOut] = await Promise.all([
        makeUniEvmToken(
          this.provider,
          network.chainId,
          tokenInfo.ustPairedAddress
        ),
        makeUniEvmToken(this.provider, network.chainId, tokenInfo.address),
      ]);
    }
    return;
  }

  public getPoolFee(): string {
    return "";
  }

  public setDeadline(deadline: string): void {
    this.deadline = deadline;
  }

  public getTradeDeadline(): ethers.BigNumber {
    return computeTradeDeadline(this.deadline);
  }

  /*
  public computeUnitAmountIn(amount: string): string {
    return this.tokenIn.computeUnitAmount(amount).toString();
  }
  */

  public computeUnitAmountOut(amount: string): string {
    return this.tokenOut.computeUnitAmount(amount).toString();
  }

  public formatAmountIn(amount: string): string {
    return this.tokenIn.formatAmount(stringToBigNumber(amount));
  }

  public formatAmountOut(amount: string): string {
    return this.tokenOut.formatAmount(stringToBigNumber(amount));
  }

  public getTokenInDecimals(): number {
    return this.tokenIn.getDecimals();
  }

  public getTokenOutDecimals(): number {
    return this.tokenOut.getDecimals();
  }

  public getTokenOutAddress(): string {
    return this.tokenOut.getAddress();
  }

  abstract getProtocol(): string;
}
