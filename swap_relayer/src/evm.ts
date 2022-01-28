import {
  getIsTransferCompletedEth,
  hexToUint8Array,
} from "@certusone/wormhole-sdk";

import { ethers } from "ethers";

import { abi as SWAP_CONTRACT_V2_ABI } from "../../react/src/abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../../react/src/abi/contracts/CrossChainSwapV3.json";

import * as swap from "../../react/src/swapper/helpers";

import { logger, OurEnvironment, Type3Payload } from "./index";

export type EvmEnvironment = {
  name: string;
  chain_id: number;
  provider_url: string;
  contract_address: string;
  token_bridge_address: string;
  wallet_private_key: string;
  abi_version: string;
};

type EvmContractData = {
  chain_id: number;
  name: string;
  contractAddress: string;
  tokenBridgeAddress: string;
  contract: ethers.Contract;
  provider: ethers.providers.StaticJsonRpcProvider;
  wallet: ethers.Wallet;
  contractWithSigner: ethers.Contract;
};

let evmContractData = new Map<number, EvmContractData>();

export function loadEvmConfig(): EvmEnvironment[] {
  let evm_configs: EvmEnvironment[] = [];
  let evms = process.env.EVM_CHAINS.split(",");
  for (const evm of evms) {
    let key_chain_id: string = evm + "_CHAIN_ID";
    let val_chain_id: string = eval("process.env." + key_chain_id);
    if (!val_chain_id) {
      logger.error("Missing environment variable " + key_chain_id);
      return undefined;
    }

    let key_provider: string = evm + "_PROVIDER";
    let val_provider: string = eval("process.env." + key_provider);
    if (!val_provider) {
      logger.error("Missing environment variable " + key_provider);
      return undefined;
    }

    let key_contract_address: string = evm + "_CONTRACT_ADDRESS";
    let val_contract_address: string = eval(
      "process.env." + key_contract_address
    );
    if (!val_contract_address) {
      logger.error("Missing environment variable " + key_contract_address);
      return undefined;
    }

    let key_token_bridge_address: string = evm + "_TOKEN_BRIDGE_ADDRESS";
    let val_token_bridge_address: string = eval(
      "process.env." + key_token_bridge_address
    );
    if (!val_token_bridge_address) {
      logger.error("Missing environment variable " + key_token_bridge_address);
      return undefined;
    }

    let key_wallet_private_key: string = evm + "_WALLET_PRIVATE_KEY";
    let val_wallet_private_key: string = eval(
      "process.env." + key_wallet_private_key
    );
    if (!val_wallet_private_key)
      val_wallet_private_key = process.env.WALLET_PRIVATE_KEY;
    if (!val_wallet_private_key) {
      logger.error(
        "Missing environment variable " +
          key_wallet_private_key +
          " or WALLET_PRIVATE_KEY"
      );
      return undefined;
    }

    let key_abi_version: string = evm + "_ABI";
    let val_abi_version: string = eval("process.env." + key_abi_version);
    if (!val_abi_version) {
      logger.error("Missing environment variable " + key_abi_version);
      return undefined;
    }

    if (val_abi_version !== "V2" && val_abi_version !== "V3") {
      logger.error(
        "Invalid value of environment variable " +
          key_abi_version +
          ", is [" +
          val_abi_version +
          "], must be either V2 or V3"
      );
      return undefined;
    }

    evm_configs.push({
      name: evm,
      chain_id: parseInt(val_chain_id),
      provider_url: val_provider,
      contract_address: val_contract_address,
      token_bridge_address: val_token_bridge_address,
      wallet_private_key: val_wallet_private_key,
      abi_version: val_abi_version,
    });
  }

  return evm_configs;
}

export function makeEvmContractData(envs: EvmEnvironment[]) {
  if (!envs) return;
  for (const evm of envs) {
    evmContractData.set(evm.chain_id, makeContractDataForEvm(evm));
  }
}

function makeContractDataForEvm(env: EvmEnvironment): EvmContractData {
  let contractAddress: string = env.contract_address.toLowerCase();
  if (contractAddress.search("0x") === 0) {
    contractAddress = contractAddress.substring(2);
  }

  logger.info(
    "Connecting to " +
      env.name +
      ": chain_id: " +
      env.chain_id +
      ", contract address: [" +
      contractAddress +
      "], node: [" +
      env.provider_url +
      "], token bridge address: [" +
      env.token_bridge_address +
      "], abi version: [" +
      env.abi_version +
      "]"
  );

  const provider = new ethers.providers.StaticJsonRpcProvider(env.provider_url);

  const contract = new ethers.Contract(
    contractAddress,
    env.abi_version == "V2" ? SWAP_CONTRACT_V2_ABI : SWAP_CONTRACT_V3_ABI,
    provider
  );

  const wallet = new ethers.Wallet(env.wallet_private_key, provider);
  const contractWithSigner = contract.connect(wallet);

  return {
    chain_id: env.chain_id,
    name: env.name,
    contractAddress: contractAddress,
    tokenBridgeAddress: env.token_bridge_address,
    contract: contract,
    provider: provider,
    wallet: wallet,
    contractWithSigner: contractWithSigner,
  };
}

export function isEvmContract(
  contractAddress: string,
  chain_id: number
): boolean {
  let ecd = evmContractData.get(chain_id);
  return ecd && ecd.contractAddress === contractAddress;
}

/*
  // GOERLI_PROVIDER = Ethereum
  // MUMBAI_PROVIDER = Polygon

  if (t3Payload.contractAddress === CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM) {
    // Use one of the V3 swap methods.
  } else if (t3Payload.contractAddress === CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON) {
    // Use one of the V2 swap methods.
  } else {
    // Error
  }

  if (t3Payload.swapFunctionType === 1 && t3Payload.swapCurrencyType === 1) {
    // swapExactInFromVaaNative
  } else if (t3Payload.swapFunctionType === 1 && t3Payload.swapCurrencyType === 2) {
    // swapExactInFromVaaToken    
  } else if (
    t3Payload.swapFunctionType === 2 &&  t3Payload.swapCurrencyType === 1) {
    // swapExactOutFromVaaNative
  } else if (t3Payload.swapFunctionType === 2 && t3Payload.swapCurrencyType === 2) {
    // swapExactOutFromVaaToken
  } else {
    // error
  }
*/

/*
  // GOERLI_PROVIDER = Ethereum
  // MUMBAI_PROVIDER = Polygon

  if (t3Payload.contractAddress === CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM) {
    // Use one of the V3 swap methods.
  } else if (t3Payload.contractAddress === CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON) {
    // Use one of the V2 swap methods.
  } else {
    // Error
  }

  if (t3Payload.swapFunctionType === 1 && t3Payload.swapCurrencyType === 1) {
    // swapExactInFromVaaNative
  } else if (t3Payload.swapFunctionType === 1 && t3Payload.swapCurrencyType === 2) {
    // swapExactInFromVaaToken    
  } else if (
    t3Payload.swapFunctionType === 2 &&  t3Payload.swapCurrencyType === 1) {
    // swapExactOutFromVaaNative
  } else if (t3Payload.swapFunctionType === 2 && t3Payload.swapCurrencyType === 2) {
    // swapExactOutFromVaaToken
  } else {
    // error
  }
*/

export async function relayVaaToEvm(vaaBytes: string, t3Payload: Type3Payload) {
  let ecd = evmContractData.get(t3Payload.targetChainId);
  if (!ecd) {
    logger.error(
      "relayVaaToEvm: chain id " + t3Payload.targetChainId + " does not exist!"
    );
  }

  let exactIn: boolean = false;
  let error: boolean = false;
  if (t3Payload.swapFunctionType === 1) {
    exactIn = true;
  } else if (t3Payload.swapFunctionType !== 2) {
    error = true;
    logger.error(
      "relayVaaTo" +
        ecd.name +
        ": unsupported swapFunctionType: [" +
        t3Payload.swapFunctionType +
        "]"
    );
  }

  let native: boolean = false;
  if (t3Payload.swapCurrencyType === 1) {
    native = true;
  } else if (t3Payload.swapCurrencyType !== 2) {
    error = true;
    logger.error(
      "relayVaaTo" +
        ecd.name +
        ": unsupported swapCurrencyType: [" +
        t3Payload.swapCurrencyType +
        "]"
    );
  }

  if (error) return;

  logger.debug(
    "relayVaaTo" +
      ecd.name +
      ": chain_id: " +
      ecd.chain_id +
      ", contractAddress: [" +
      t3Payload.contractAddress +
      "]"
  );

  const signedVaaArray = hexToUint8Array(vaaBytes);
  await relayVaaToEvmChain(t3Payload, ecd, signedVaaArray, exactIn, native);
}

async function relayVaaToEvmChain(
  t3Payload: Type3Payload,
  tcd: EvmContractData,
  signedVaaArray: Uint8Array,
  exactIn: boolean,
  native: boolean
) {
  logger.debug(
    "relayVaaTo" +
      tcd.name +
      ": checking if already redeemed on " +
      tcd.name +
      " using tokenBridgeAddress [" +
      tcd.tokenBridgeAddress +
      "]"
  );

  if (await isRedeemedOnEvm(t3Payload, tcd, signedVaaArray)) {
    logger.info(
      "relayVaaTo" +
        tcd.name +
        ": contract: [" +
        t3Payload.contractAddress +
        "], exactIn: " +
        exactIn +
        ", native: " +
        native +
        ": already transferred"
    );

    return;
  }

  logger.info(
    "relayVaaTo" +
      tcd.name +
      ": contract: [" +
      t3Payload.contractAddress +
      "], exactIn: " +
      exactIn +
      ", native: " +
      native +
      ": submitting redeem request"
  );

  try {
    let receipt: any = null;
    if (exactIn) {
      if (native) {
        logger.debug("relayVaaTo: calling evmSwapExactInFromVaaNative()");
        receipt = await swap.evmSwapExactInFromVaaNative(
          tcd.contractWithSigner,
          signedVaaArray
        );
      } else {
        logger.debug("relayVaaTo: calling evmSwapExactInFromVaaToken()");
        receipt = await swap.evmSwapExactInFromVaaToken(
          tcd.contractWithSigner,
          signedVaaArray
        );
      }
    } else {
      if (native) {
        logger.debug("relayVaaTo: calling evmSwapExactOutFromVaaNative()");
        receipt = await swap.evmSwapExactOutFromVaaNative(
          tcd.contractWithSigner,
          signedVaaArray
        );
      } else {
        logger.debug("relayVaaTo: calling evmSwapExactOutFromVaaToken()");
        receipt = await swap.evmSwapExactOutFromVaaToken(
          tcd.contractWithSigner,
          signedVaaArray
        );
      }
    }

    logger.info(
      "relayVaaTo" +
        tcd.name +
        ": contract: [" +
        t3Payload.contractAddress +
        "], exactIn: " +
        exactIn +
        ", native: " +
        native +
        ": success, txHash: " +
        receipt.transactionHash
    );
  } catch (e: any) {
    if (await isRedeemedOnEvm(t3Payload, tcd, signedVaaArray)) {
      logger.info(
        "relayVaaTo" +
          tcd.name +
          ": contract: [" +
          t3Payload.contractAddress +
          "], exactIn: " +
          exactIn +
          ", native: " +
          native +
          ": relay failed because the vaa has already been redeemed"
      );

      return;
    }

    logger.error(
      "relayVaaTo" +
        tcd.name +
        ": contract: [" +
        t3Payload.contractAddress +
        "], exactIn: " +
        exactIn +
        ", native: " +
        native +
        ": transaction failed: %o",
      e
    );
  }

  if (await isRedeemedOnEvm(t3Payload, tcd, signedVaaArray)) {
    logger.info(
      "relayVaaTo" +
        tcd.name +
        ": contract: [" +
        t3Payload.contractAddress +
        "], exactIn: " +
        exactIn +
        ", native: " +
        native +
        ": redeem succeeded"
    );
  } else {
    logger.error(
      "relayVaaTo" +
        tcd.name +
        ": contract: [" +
        t3Payload.contractAddress +
        "], exactIn: " +
        exactIn +
        ", native: " +
        native +
        ": redeem failed!"
    );
  }
}

async function isRedeemedOnEvm(
  t3Payload: Type3Payload,
  tcd: EvmContractData,
  signedVaaArray: Uint8Array
): Promise<boolean> {
  let redeemed: boolean = false;
  try {
    redeemed = await getIsTransferCompletedEth(
      tcd.tokenBridgeAddress,
      tcd.provider,
      signedVaaArray
    );
  } catch (e) {
    logger.error(
      "relayVaaTo" +
        tcd.name +
        ": failed to check if transfer is already complete, will attempt the transfer, e: %o",
      e
    );
  }

  return redeemed;
}
