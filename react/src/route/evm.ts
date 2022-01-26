import { ethers } from "ethers";

import { GenericToken } from "./generic";

// erc20 spec
import { abi as Erc20Abi } from "../../abi/erc20.json";
import {
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { APPROVAL_GAS_LIMIT } from "../utils/consts";

export class EvmToken extends GenericToken {
  token: ethers.Contract;
  decimals: number;

  async initialize(provider: ethers.providers.Provider, tokenAddress: string) {
    this.token = await makeErc20Contract(provider, tokenAddress);
    this.decimals = await this.token.decimals();
  }

  static async create(
    provider: ethers.providers.Provider,
    tokenAddress: string
  ): Promise<EvmToken> {
    const o = new EvmToken();
    await o.initialize(provider, tokenAddress);
    return o;
  }

  getAddress(): string {
    return this.token.address;
  }

  getDecimals(): number {
    return this.decimals;
  }

  getContract(): ethers.Contract {
    return this.token;
  }

  async getBalanceOf(signer: ethers.Wallet) {
    const decimals = this.getDecimals();
    const balanceBeforeDecimals = await this.token.balanceOf(signer.address);
    return ethers.utils.formatUnits(balanceBeforeDecimals.toString(), decimals);
  }

  computeUnitAmount(amount: string): ethers.BigNumber {
    return ethers.utils.parseUnits(amount, this.getDecimals());
  }

  formatAmount(unitAmount: ethers.BigNumber): string {
    return ethers.utils.formatUnits(unitAmount, this.getDecimals());
  }

  addAmounts(left: string, right: string): string {
    const sum = ethers.FixedNumber.from(left).addUnsafe(
      ethers.FixedNumber.from(right)
    );
    return sum.round(this.getDecimals()).toString();
  }

  subtractAmounts(left: string, right: string): string {
    const sum = ethers.FixedNumber.from(left).subUnsafe(
      ethers.FixedNumber.from(right)
    );
    return sum.round(this.getDecimals()).toString();
  }
}

export async function makeErc20Contract(
  provider: ethers.providers.Provider,
  tokenAddress: string
): Promise<ethers.Contract> {
  return new ethers.Contract(tokenAddress, Erc20Abi, provider);
}

export async function approveContractTokenSpend(
  provider: ethers.providers.Provider,
  signer: ethers.Wallet,
  tokenContract: ethers.Contract,
  smartContractAddress: string,
  swapAmount: ethers.BigNumber
): Promise<TransactionReceipt> {
  // build transaction for token spending
  const unsignedTx: TransactionRequest =
    await tokenContract.populateTransaction.approve(
      smartContractAddress,
      swapAmount
    );
  const nonce = await provider.getTransactionCount(signer.address, "latest");

  const gasPrice = await signer.getGasPrice();
  const parsedGasPrice = ethers.utils.hexlify(parseInt(gasPrice.toString()));

  unsignedTx.nonce = nonce;
  unsignedTx.gasLimit = ethers.BigNumber.from(APPROVAL_GAS_LIMIT);
  unsignedTx.gasPrice = ethers.BigNumber.from(parsedGasPrice);

  // sign and send transaction
  const tx: TransactionResponse = await signer.sendTransaction(unsignedTx);
  return tx.wait();
}
