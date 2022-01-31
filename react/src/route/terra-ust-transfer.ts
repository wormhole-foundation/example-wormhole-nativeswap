import { Dec, Int } from "@terra-money/terra.js";

import { UST_TOKEN_INFO } from "../utils/consts";
import { RouterCore } from "./generic";

export const PROTOCOL = "TerraUstTransfer";

const UST_DECIMALS = 6;

const UST_AMOUNT_MULTIPLIER = "1000000";

export class TerraUstTransfer extends RouterCore {
  computePoolAddress(): string {
    return UST_TOKEN_INFO.address;
  }

  computeAndVerifyPoolAddress(): Promise<string> {
    return new Promise<string>((resolve) => {
      return resolve(this.computePoolAddress());
    });
  }

  formatAmountIn(amount: string): string {
    const formatted = new Dec(amount).div(UST_AMOUNT_MULTIPLIER);
    return formatted.toString();
  }

  formatAmountOut(amount: string): string {
    return this.formatAmountIn(amount);
  }

  computeUnitAmountIn(amount: string): string {
    const unitified = new Dec(amount).mul(UST_AMOUNT_MULTIPLIER);
    return new Int(unitified.toString()).toString();
  }

  computeUnitAmountOut(amount: string): string {
    return this.computeUnitAmountIn(amount);
  }

  getProtocol(): string {
    return PROTOCOL;
  }

  async fetchExactInQuote(amountIn: string, slippage: string): Promise<string> {
    return amountIn;
  }

  async fetchExactOutQuote(
    amountOut: string,
    slippage: string
  ): Promise<string> {
    return amountOut;
  }

  getTokenInDecimals(): number {
    return UST_DECIMALS;
  }

  getTokenOutDecimals(): number {
    return UST_DECIMALS;
  }

  getTokenOutAddress(): string {
    return this.computePoolAddress();
  }
}
