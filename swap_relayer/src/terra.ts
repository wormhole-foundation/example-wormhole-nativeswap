import {
  CHAIN_ID_TERRA,
  getIsTransferCompletedTerra,
  redeemOnTerra,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";

import axios from "axios";
import { bech32 } from "bech32";
import { zeroPad } from "ethers/lib/utils";
import { fromUint8Array } from "js-base64";

import * as Terra from "@terra-money/terra.js";

import { logger, OurEnvironment, Type3Payload } from "./index";

export type TerraEnvironment = {
  terra_enabled: boolean;
  terra_provider_url: string;
  terra_chain_id: string;
  terra_name: string;
  terra_contract_address: string;
  terra_token_bridge_address: string;
  terra_wallet_private_key: string;
  terra_gas_price_url: string;
};

type TerraContractData = {
  name: string;
  contractAddress: string;
  encodedContractAddress: string;
  tokenBridgeAddress: string;
  lcdConfig: Terra.LCDClientConfig;
  lcdClient: Terra.LCDClient;
  wallet: Terra.Wallet;
  gasPriceUrl: string;
};

let terraContractData: TerraContractData = null;

export function loadTerraConfig(): TerraEnvironment {
  let terra_enabled: boolean = false;
  if (process.env.TERRA_PROVIDER) {
    terra_enabled = true;

    if (!process.env.TERRA_CHAIN_ID) {
      logger.error("Missing environment variable WALLET_PRIVATE_KEY");
      return undefined;
    }

    if (!process.env.TERRA_NAME) {
      logger.error("Missing environment variable WALLET_PRIVATE_KEY");
      return undefined;
    }

    if (!process.env.TERRA_WALLET_PRIVATE_KEY) {
      logger.error("Missing environment variable TERRA_WALLET_PRIVATE_KEY");
      return undefined;
    }

    if (!process.env.TERRA_GAS_PRICE_URL) {
      logger.error("Missing environment variable TERRA_GAS_PRICE_URL");
      return undefined;
    }

    if (!process.env.TERRA_CONTRACT_ADDRESS) {
      logger.error("Missing environment variable TERRA_CONTRACT_ADDRESS");
      return undefined;
    }

    if (!process.env.TERRA_TOKEN_BRIDGE_ADDRESS) {
      logger.error("Missing environment variable TERRA_TOKEN_BRIDGE_ADDRESS");
      return undefined;
    }
  }

  return {
    terra_enabled: terra_enabled,
    terra_provider_url: process.env.TERRA_PROVIDER,
    terra_chain_id: process.env.TERRA_CHAIN_ID,
    terra_name: process.env.TERRA_NAME,
    terra_contract_address: process.env.TERRA_CONTRACT_ADDRESS,
    terra_token_bridge_address: process.env.TERRA_TOKEN_BRIDGE_ADDRESS,
    terra_wallet_private_key: process.env.TERRA_WALLET_PRIVATE_KEY,
    terra_gas_price_url: process.env.TERRA_GAS_PRICE_URL,
  };
}

export function makeTerraContractData(env: TerraEnvironment) {
  if (!env.terra_enabled) return;
  let contractAddress: string = env.terra_contract_address.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  let encodedContractAddress: string = Buffer.from(
    zeroPad(bech32.fromWords(bech32.decode(contractAddress).words), 32)
  ).toString("hex");

  logger.info(
    "Connecting to Terra: contract address: [" +
      contractAddress +
      "], encoded contract address: [" +
      encodedContractAddress +
      "], node: [" +
      env.terra_provider_url +
      "], token bridge address: [" +
      env.terra_token_bridge_address +
      "], terra chain id: [" +
      env.terra_chain_id +
      "], terra name: [" +
      env.terra_name +
      "]"
  );

  const lcdConfig = {
    URL: env.terra_provider_url,
    chainID: env.terra_chain_id,
    name: env.terra_name,
  };

  const lcdClient = new Terra.LCDClient(lcdConfig);

  const mk = new Terra.MnemonicKey({
    mnemonic: env.terra_wallet_private_key,
  });

  const wallet = lcdClient.wallet(mk);

  terraContractData = {
    name: "Terra",
    contractAddress: contractAddress,
    encodedContractAddress: encodedContractAddress,
    tokenBridgeAddress: env.terra_token_bridge_address,
    lcdConfig: lcdConfig,
    lcdClient: lcdClient,
    wallet: wallet,
    gasPriceUrl: env.terra_gas_price_url,
  };
}

export function isTerraContract(
  contractAddress: string,
  chain_id: number
): boolean {
  if (chain_id !== CHAIN_ID_TERRA) return false;
  if (!terraContractData) return false;

  let retVal: boolean =
    terraContractData &&
    contractAddress === terraContractData.encodedContractAddress;
  logger.debug(
    "isTerraContract: comparing [" +
      contractAddress +
      "] to [" +
      terraContractData.encodedContractAddress +
      "]: " +
      retVal
  );

  return retVal;
}

export async function relayVaaToTerra(
  t3Payload: Type3Payload,
  vaaBytes: string
) {
  if (!terraContractData) return;

  // logger.debug(
  //   "relayVaaToTerra: checking if already redeemed using tokenBridgeAddress [" +
  //     terraContractData.tokenBridgeAddress +
  //     "]"
  // );

  // if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
  //   logger.info(
  //     "relayVaaToTerra: contract: [" +
  //       t3Payload.contractAddress +
  //       "]: already transferred"
  //   );

  //   return;
  // }

  logger.info(
    "relayVaaToTerra: contract: [" +
      t3Payload.contractAddress +
      "]: submitting redeem request"
  );

  try {
    logger.debug(
      "relayVaaToTerra: creating message using contract address [" +
        terraContractData.contractAddress +
        "]"
    );

    logger.debug("relayVaaToTerra: creating a message");

    logger.debug(
      "relayVaaToTerra: vaa as hex: [" +
        Buffer.from(vaaBytes, "hex").toString("hex") +
        "]"
    );

    logger.debug(
      "relayVaaToTerra: vaa as base64: [" +
        Buffer.from(vaaBytes, "hex").toString("base64") +
        "]"
    );
    const msg = new Terra.MsgExecuteContract(
      terraContractData.wallet.key.accAddress,
      terraContractData.contractAddress,
      {
        redeem_payload: {
          data: Buffer.from(vaaBytes, "hex").toString("base64"),
        },
      }
    );

    // logger.debug("relayVaaToTerra: getting gas prices");
    // const gasPrices = terraContractData.lcdClient.config.gasPrices;

    // logger.debug("relayVaaToTerra: estimating fees");
    // const feeEstimate = await terraContractData.lcdClient.tx.estimateFee(terraContractData.wallet.key.accAddress, [msg], {
    //   feeDenoms: ["uluna"],
    //   gasPrices,
    // });

    logger.debug("relayVaaToTerra: creating transaction");
    const tx = await terraContractData.wallet.createAndSignTx({
      msgs: [msg],
      memo: "swap relayer",
      feeDenoms: ["uluna"],
      // gasPrices,
      // fee: feeEstimate,
    });

    logger.debug("relayVaaToTerra: submitting transaction");
    const receipt = await terraContractData.lcdClient.tx.broadcast(tx);

    logger.info(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: success: %o",
      receipt
    );

    // logger.info(
    //   "relayVaaToTerra: contract: [" +
    //     t3Payload.contractAddress +
    //     "]: success, txHash: " +
    //     receipt.transactionHash
    // );
  } catch (e: any) {
    // if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
    //   logger.info(
    //     "relayVaaToTerra: contract: [" +
    //       t3Payload.contractAddress +
    //       "]: relay failed because the vaa has already been redeemed"
    //   );

    //   return;
    // }

    logger.error(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: transaction failed: %o",
      e
    );
  }

  // if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
  //   logger.info(
  //     "relayVaaToTerra: contract: [" +
  //       t3Payload.contractAddress +
  //       "]: redeem succeeded"
  //   );
  // } else {
  //   logger.error(
  //     "relayVaaToTerra: contract: [" +
  //       t3Payload.contractAddress +
  //       "]: redeem failed!"
  //   );
  // }
}

async function isRedeemedOnTerra(
  t3Payload: Type3Payload,
  terraContractData: TerraContractData,
  signedVaaArray: Uint8Array
): Promise<boolean> {
  let msg: Terra.MsgExecuteContract = null;
  let sequenceNumber: number = 0;
  try {
    msg = new Terra.MsgExecuteContract(
      terraContractData.wallet.key.accAddress,
      terraContractData.tokenBridgeAddress,
      {
        submit_vaa: {
          data: fromUint8Array(signedVaaArray),
        },
      }
    );

    sequenceNumber = await terraContractData.wallet.sequence();
  } catch (e) {
    logger.error(
      "isRedeemedOnTerra: failed to create message or look up sequence number, e: %o",
      e
    );

    return false;
  }

  try {
    await terraContractData.lcdClient.tx.estimateFee(
      [{ sequenceNumber: sequenceNumber }],
      {
        msgs: [msg],
      }
    );
  } catch (e) {
    if (e.response.data.error.includes("VaaAlreadyExecuted")) {
      return true;
    }

    logger.error(
      "isRedeemedOnTerra: failed to check if transfer is already complete, e: %o",
      e
    );
  }

  return false;
}
