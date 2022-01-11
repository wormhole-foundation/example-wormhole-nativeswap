import { ethers } from "ethers";
import { CurrencyAmount, Token } from "@uniswap/sdk-core";

import { EvmToken } from "./evm";

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

export abstract class UniswapRouterCore {
  provider: ethers.providers.Provider;

  // params
  deadline: string = "";

  constructor(provider: ethers.providers.Provider) {
    this.provider = provider;
  }

  public async makeToken(tokenAddress: string): Promise<UniEvmToken> {
    const network = await this.provider.getNetwork();
    return makeUniEvmToken(this.provider, network.chainId, tokenAddress);
  }

  abstract computePoolAddress(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken
  ): string;

  abstract computeAndVerifyPoolAddress(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken
  ): Promise<string>;

  abstract fetchQuoteAmountOut(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken,
    amountOut: string,
    slippage: string
  ): Promise<ethers.BigNumber>;

  abstract fetchQuoteAmountIn(
    tokenIn: UniEvmToken,
    tokenOut: UniEvmToken,
    amountOut: string,
    slippage: string
  ): Promise<ethers.BigNumber>;

  abstract getProtocol(): string;

  public getPoolFee(): string {
    return "";
  }

  public setDeadline(deadline: string): void {
    this.deadline = deadline;
  }

  public getTradeDeadline(): ethers.BigNumber {
    return computeTradeDeadline(this.deadline);
  }
}
