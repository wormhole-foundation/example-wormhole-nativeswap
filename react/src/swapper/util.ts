import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/abstract-provider";

export const CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3 = {
  gasLimit: "550000",
  maxFeePerGas: "250000000000",
  maxPriorityFeePerGas: "1690000000",
};

export const CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2 = {
  gasLimit: "550000",
  maxFeePerGas: "250000000000",
  maxPriorityFeePerGas: "1690000000",
};

// exact in
//
export async function swapExactInFromVaaNativeV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactInFromVaaNativeV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

export async function swapExactInFromVaaTokenV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactInFromVaaTokenV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactIn(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

// exact out (TODO: add to util)
//
export async function swapExactOutFromVaaNativeV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactOutFromVaaNativeV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactNativeOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

export async function swapExactOutFromVaaTokenV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactOutFromVaaTokenV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.recvAndSwapExactOut(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}
