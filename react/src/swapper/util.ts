import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/abstract-provider";

export const CROSSCHAINSWAP_GAS_PARAMETERS = {
  gasLimit: "550000",
  maxFeePerGas: "250000000000",
  maxPriorityFeePerGas: "1690000000",
};

// exact in
//
export async function swapExactInFromVaaNative(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS
  );
  return tx.wait();
}

export async function swapExactInFromVaaToken(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS
  );
  return tx.wait();
}

// exact out (TODO: add to util)
//
export async function swapExactOutFromVaaNative(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS
  );
  return tx.wait();
}

export async function swapExactOutFromVaaToken(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS
  );
  return tx.wait();
}
