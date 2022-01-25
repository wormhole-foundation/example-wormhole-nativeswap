import {
  getIsTransferCompletedTerra,
  redeemOnTerra,
} from "@certusone/wormhole-sdk";

import {
  importCoreWasm,
  setDefaultWasm,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";

import * as Terra from "@terra-money/terra.js";

import { logger, OurEnvironment, Type3Payload } from "./index";

type TerraContractData = {
  name: string;
  contractAddress: string;
  tokenBridgeAddress: string;
  lcdConfig: Terra.LCDClientConfig;
  lcdClient: Terra.LCDClient;
  wallet: Terra.Wallet;
  gasPriceUrl: string;
};

let terraContractData: TerraContractData = null;

export function makeTerraContractData(env: OurEnvironment) {
  let contractAddress: string = env.terra_contract_address.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  logger.info(
    "Connecting to Terra: contract address: [" +
      contractAddress +
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
    tokenBridgeAddress: env.terra_token_bridge_address,
    lcdConfig: lcdConfig,
    lcdClient: lcdClient,
    wallet: wallet,
    gasPriceUrl: env.terra_gas_price_url,
  };
}

export function isTerraContract(contractAddress: string): boolean {
  return (
    terraContractData && contractAddress === terraContractData.contractAddress
  );
}

export async function relayVaaToTerra(
  t3Payload: Type3Payload,
  signedVaaArray: Uint8Array
) {
  if (!terraContractData) return;

  logger.debug(
    "relayVaaToTerra: checking if already redeemed using tokenBridgeAddress [" +
      terraContractData.tokenBridgeAddress +
      "]"
  );

  if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
    logger.info(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: already transferred"
    );

    return;
  }

  logger.info(
    "relayVaaToTerra: contract: [" +
      t3Payload.contractAddress +
      "]: submitting redeem request"
  );

  try {
    const msg = await redeemOnTerra(
      terraContractData.contractAddress,
      terraContractData.wallet.key.accAddress,
      signedVaaArray
    );

    let receipt: any = null;

    logger.info(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: success, txHash: " +
        receipt.transactionHash
    );
  } catch (e: any) {
    if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
      logger.info(
        "relayVaaToTerra: contract: [" +
          t3Payload.contractAddress +
          "]: relay failed because the vaa has already been redeemed"
      );

      return;
    }

    logger.error(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: transaction failed: %o",
      e
    );
  }

  if (await isRedeemedOnTerra(t3Payload, terraContractData, signedVaaArray)) {
    logger.info(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: redeem succeeded"
    );
  } else {
    logger.error(
      "relayVaaToTerra: contract: [" +
        t3Payload.contractAddress +
        "]: redeem failed!"
    );
  }
}

async function isRedeemedOnTerra(
  t3Payload: Type3Payload,
  terraContractData: TerraContractData,
  signedVaaArray: Uint8Array
): Promise<boolean> {
  let redeemed: boolean = false;
  try {
    redeemed = await await getIsTransferCompletedTerra(
      terraContractData.tokenBridgeAddress,
      signedVaaArray,
      terraContractData.wallet.key.accAddress,
      terraContractData.lcdClient,
      terraContractData.gasPriceUrl
    );
  } catch (e) {
    logger.error(
      "relayVaaTo" +
        terraContractData.name +
        ": failed to check if transfer is already complete, will attempt the transfer, e: %o",
      e
    );
  }

  return redeemed;
}
