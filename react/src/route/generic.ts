import { FixedNumber } from "ethers";

export enum UstLocation {
  In = 1,
  Out,
}

export abstract class RouterCore {
  abstract computeAndVerifyPoolAddress(): Promise<string>;

  abstract computePoolAddress(): string;

  //abstract computeUnitAmountIn(amount: string): string;

  abstract computeUnitAmountOut(amount: string): string;

  abstract fetchExactInQuote(
    amountOut: string,
    slippage: string
  ): Promise<string>;

  abstract fetchExactOutQuote(
    amountOut: string,
    slippage: string
  ): Promise<string>;

  abstract formatAmountIn(amount: string): string;

  abstract formatAmountOut(amount: string): string;

  abstract getProtocol(): string;

  abstract getTokenInDecimals(): number;

  abstract getTokenOutDecimals(): number;

  abstract getTokenOutAddress(): string;
}

export abstract class GenericToken {
  abstract getAddress(): string;

  abstract getDecimals(): number;
}
