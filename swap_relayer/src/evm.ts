import { Mutex } from "async-mutex";
let CondVar = require("condition-variable");

import { getIsTransferCompletedEth } from "@certusone/wormhole-sdk";

import {
  importCoreWasm,
  setDefaultWasm,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";

import { ethers } from "ethers";

import { abi as SWAP_CONTRACT_V2_ABI } from "../../react/src/abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../../react/src/abi/contracts/CrossChainSwapV3.json";

import * as swap from "../../react/src/swapper/util";

import { logger, OurEnvironment, Type3Payload } from "./index";

type EvmContractData = {
  name: string;
  contractAddress: string;
  tokenBridgeAddress: string;
  contract: ethers.Contract;
  provider: ethers.providers.StaticJsonRpcProvider;
  wallet: ethers.Wallet;
  contractWithSigner: ethers.Contract;
};

let ethContractData: EvmContractData = null;
let polygonContractData: EvmContractData = null;

export function makeEvmContractData(env: OurEnvironment) {
  ethContractData = makeEthContractData(env);
  polygonContractData = makePolygonContractData(env);
}

// Ethereum (Goerli) set up
function makeEthContractData(env: OurEnvironment): EvmContractData {
  let contractAddress: string = env.eth_contract_address.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  logger.info(
    "Connecting to Ethereum: contract address: [" +
      contractAddress +
      "], node: [" +
      env.eth_provider_url +
      "], token bridge address: [" +
      env.eth_token_bridge_address +
      "]"
  );

  const provider = new ethers.providers.StaticJsonRpcProvider(
    env.eth_provider_url
  );

  const contract = new ethers.Contract(
    contractAddress,
    SWAP_CONTRACT_V3_ABI,
    provider
  );

  const wallet = new ethers.Wallet(env.evm_wallet_private_key, provider);
  const contractWithSigner = contract.connect(wallet);

  return {
    name: "Ethereum",
    contractAddress: contractAddress,
    tokenBridgeAddress: env.eth_token_bridge_address,
    contract: contract,
    provider: provider,
    wallet: wallet,
    contractWithSigner: contractWithSigner,
  };
}

// Polygon (Mumbai) set up
function makePolygonContractData(env: OurEnvironment): EvmContractData {
  let contractAddress: string = env.polygon_contract_address.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  logger.info(
    "Connecting to Polygon: contract address: [" +
      contractAddress +
      "], node: [" +
      env.polygon_provider_url +
      "], token bridge address: [" +
      env.polygon_token_bridge_address +
      "]"
  );

  const provider = new ethers.providers.StaticJsonRpcProvider(
    env.polygon_provider_url
  );

  const contract = new ethers.Contract(
    contractAddress,
    SWAP_CONTRACT_V2_ABI,
    provider
  );

  const wallet = new ethers.Wallet(env.evm_wallet_private_key, provider);
  const contractWithSigner = contract.connect(wallet);

  return {
    name: "Polygon",
    contractAddress: contractAddress,
    tokenBridgeAddress: env.polygon_token_bridge_address,
    contract: contract,
    provider: provider,
    wallet: wallet,
    contractWithSigner: contractWithSigner,
  };
}

export function isEvmContract(contractAddress: string): boolean {
  return (
    (ethContractData && contractAddress === ethContractData.contractAddress) ||
    (polygonContractData &&
      contractAddress === polygonContractData.contractAddress)
  );
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

export async function relayVaaToEvm(
  signedVaaArray: Uint8Array,
  t3Payload: Type3Payload
) {
  let exactIn: boolean = false;
  if (t3Payload.swapFunctionType === 1) {
    exactIn = true;
  } else if (t3Payload.swapFunctionType !== 2) {
    logger.error(
      "relayVaa: unsupported swapFunctionType: [" +
        t3Payload.swapFunctionType +
        "]"
    );
  }

  let native: boolean = false;
  if (t3Payload.swapCurrencyType === 1) {
    native = true;
  } else if (t3Payload.swapCurrencyType !== 2) {
    logger.error(
      "relayVaa: unsupported swapCurrencyType: [" +
        t3Payload.swapCurrencyType +
        "]"
    );
  }

  logger.debug(
    "relayVaa: contractAddress: [" +
      t3Payload.contractAddress +
      "], ethContract: [" +
      ethContractData.contractAddress +
      "], polygonContract[" +
      polygonContractData.contractAddress +
      "]"
  );

  if (t3Payload.contractAddress === ethContractData.contractAddress) {
    await relayVaaToEvmChain(
      t3Payload,
      ethContractData,
      signedVaaArray,
      exactIn,
      native
    );
  } else if (
    t3Payload.contractAddress === polygonContractData.contractAddress
  ) {
    await relayVaaToEvmChain(
      t3Payload,
      polygonContractData,
      signedVaaArray,
      exactIn,
      native
    );
  } else {
    logger.error(
      "relayVaa: unexpected contract: [" +
        t3Payload.contractAddress +
        "], this should not happen!"
    );
  }
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
        receipt = await swap.swapExactInFromVaaNative(
          tcd.contractWithSigner,
          signedVaaArray
        );
      } else {
        receipt = await swap.swapExactInFromVaaToken(
          tcd.contractWithSigner,
          signedVaaArray
        );
      }
    } else {
      if (native) {
        receipt = await swap.swapExactOutFromVaaNative(
          tcd.contractWithSigner,
          signedVaaArray
        );
      } else {
        receipt = await swap.swapExactOutFromVaaToken(
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
