import { getIsTransferCompletedEth } from "@certusone/wormhole-sdk";
import { ethers } from "ethers";

export default async function getIsTransferCompletedEvmWithRetry(
  tokenBridgeAddress: string,
  provider: ethers.providers.Provider,
  signedVAA: Uint8Array,
  retryTimeoutMs: number,
  retryAttempts: number
) {
  let result = false;
  let attempts = 0;
  while (attempts < retryAttempts) {
    try {
      result = await getIsTransferCompletedEth(
        tokenBridgeAddress,
        provider,
        signedVAA
      );
      console.log("getIsTransferCompletedEth", result);
    } catch (e) {
      console.error(e);
    }
    if (result) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, retryTimeoutMs));
    attempts++;
  }
  return result;
}
