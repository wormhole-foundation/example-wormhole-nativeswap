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
  const tx = await swapContractWithSigner.swapExactNativeInFromV2(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactInFromVaaNativeV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactNativeInFromV3(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

export async function swapExactInFromVaaTokenV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactInFromV2(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactInFromVaaTokenV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactInFromV3(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

// exact out
//
export async function swapExactOutFromVaaNativeV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactNativeOutFromV2(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactOutFromVaaNativeV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactNativeOutFromV3(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}

export async function swapExactOutFromVaaTokenV3(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactOutFromV2(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V3
  );
  return tx.wait();
}

export async function swapExactOutFromVaaTokenV2(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const tx = await swapContractWithSigner.swapExactOutFromV3(
    signedVaa,
    CROSSCHAINSWAP_GAS_PARAMETERS_UNISWAP_V2
  );
  return tx.wait();
}
