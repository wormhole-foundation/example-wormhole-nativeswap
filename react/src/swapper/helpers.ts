import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/abstract-provider";

import {
  EVM_ETH_NETWORK_CHAIN_ID,
  EVM_POLYGON_NETWORK_CHAIN_ID,
  EVM_AVAX_NETWORK_CHAIN_ID,
  //EVM_BSC_NETWORK_CHAIN_ID,
} from "../utils/consts";

export const CROSSCHAINSWAP_GAS_PARAMETERS_EIP1559 = {
  gasLimit: "694200",
  //maxFeePerGas: "250000000000",
  maxFeePerGas: "100420690000",
  maxPriorityFeePerGas: "1690000000",
};

export const CROSSCHAINSWAP_GAS_PARAMETERS_EVM = {
  gasLimit: "694200",
  //gasPrice: "250000000000",
  gasPrice: "20420690000",
};

export const EVM_EIP1559_CHAIN_IDS = [
  EVM_ETH_NETWORK_CHAIN_ID,
  EVM_POLYGON_NETWORK_CHAIN_ID,
  EVM_AVAX_NETWORK_CHAIN_ID,
];

export async function getEvmGasParametersForContract(
  contract: ethers.Contract
): Promise<any> {
  const chainId = await getChainIdFromContract(contract);

  if (EVM_EIP1559_CHAIN_IDS.indexOf(chainId) >= 0) {
    return CROSSCHAINSWAP_GAS_PARAMETERS_EIP1559;
  }

  return CROSSCHAINSWAP_GAS_PARAMETERS_EVM;
}

async function getChainIdFromContract(
  contract: ethers.Contract
): Promise<number> {
  const network = await contract.provider.getNetwork();
  return network.chainId;
}

// exact in
//
export async function evmSwapExactInFromVaaNative(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const gasParams = await getEvmGasParametersForContract(
    swapContractWithSigner
  );

  const tx = await swapContractWithSigner.recvAndSwapExactNativeIn(
    signedVaa,
    gasParams
  );
  return tx.wait();
}

export async function evmSwapExactInFromVaaToken(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const gasParams = await getEvmGasParametersForContract(
    swapContractWithSigner
  );

  const tx = await swapContractWithSigner.recvAndSwapExactIn(
    signedVaa,
    gasParams
  );
  return tx.wait();
}

// exact out
//
export async function evmSwapExactOutFromVaaNative(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const gasParams = await getEvmGasParametersForContract(
    swapContractWithSigner
  );

  const tx = await swapContractWithSigner.recvAndSwapExactNativeOut(
    signedVaa,
    gasParams
  );
  return tx.wait();
}

export async function evmSwapExactOutFromVaaToken(
  swapContractWithSigner: ethers.Contract,
  signedVaa: Uint8Array
): Promise<TransactionReceipt> {
  const gasParams = await getEvmGasParametersForContract(
    swapContractWithSigner
  );

  const tx = await swapContractWithSigner.recvAndSwapExactOut(
    signedVaa,
    gasParams
  );
  return tx.wait();
}
