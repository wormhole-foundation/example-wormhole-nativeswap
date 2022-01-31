import { FixedNumber } from "ethers";

export function addFixedAmounts(
  left: string,
  right: string,
  decimals: number
): string {
  const sum = FixedNumber.from(left).addUnsafe(FixedNumber.from(right));
  return sum.round(decimals).toString();
}

export function subtractFixedAmounts(
  left: string,
  right: string,
  decimals: number
): string {
  const diff = FixedNumber.from(left).subUnsafe(FixedNumber.from(right));
  return diff.round(decimals).toString();
}
