import { Mutex } from "async-mutex";
let CondVar = require("condition-variable");

import {
  ChainId,
  CHAIN_ID_SOLANA,
  CHAIN_ID_TERRA,
  hexToUint8Array,
  uint8ArrayToHex,
  getEmitterAddressEth,
  getEmitterAddressSolana,
  getEmitterAddressTerra,
  getIsTransferCompletedEth,
} from "@certusone/wormhole-sdk";

import {
  importCoreWasm,
  setDefaultWasm,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";

import {
  createSpyRPCServiceClient,
  subscribeSignedVAA,
} from "@certusone/wormhole-spydk";

import { ethers } from "ethers";

import { abi as SWAP_CONTRACT_V2_ABI } from "../../react/src/abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../../react/src/abi/contracts/CrossChainSwapV3.json";

import * as swap from "../../react/src/swapper/util";

import { isEvmContract, makeEvmContractData, relayVaaToEvm } from "./evm";

import {
  isTerraContract,
  makeTerraContractData,
  relayVaaToTerra,
} from "./terra";

export let logger: any;

let configFile: string = ".env";
if (process.env.SWAP_RELAY_CONFIG) {
  configFile = process.env.SWAP_RELAY_CONFIG;
}

console.log("Loading config file [%s]", configFile);
require("dotenv").config({ path: configFile });

initLogger();

export type OurEnvironment = {
  spy_host: string;
  spy_filters: string;

  eth_provider_url: string;
  eth_contract_address: string;
  eth_token_bridge_address: string;

  polygon_provider_url: string;
  polygon_contract_address: string;
  polygon_token_bridge_address: string;

  evm_wallet_private_key: string;

  terraEnabled: boolean;
  terra_provider_url: string;
  terra_chain_id: string;
  terra_name: string;
  terra_contract_address: string;
  terra_token_bridge_address: string;
  terra_wallet_private_key: string;
  terra_gas_price_url: string;
};

type EvmContractData = {
  name: string;
  contractAddress: string;
  tokenBridgeAddress: string;
  contract: ethers.Contract;
  provider: ethers.providers.StaticJsonRpcProvider;
  wallet: ethers.Wallet;
  contractWithSigner: ethers.Contract;
};

export type Type3Payload = {
  targetChainId: number;
  contractAddress: string;
  relayerFee: ethers.BigNumber;
  swapFunctionType: number;
  swapCurrencyType: number;
};

type PendingEvent = {
  vaaBytes: string;
  t3Payload: Type3Payload;
  receiveTime: Date;
};

setDefaultWasm("node");

let success: boolean;
let env: OurEnvironment;
[success, env] = loadConfig();

let seqMap = new Map<string, number>();

const mutex = new Mutex();
let condition = new CondVar();
let pendingQueue = new Array<PendingEvent>();

if (success) {
  logger.info(
    "swap_relay starting up, will listen for signed VAAs from [" +
      env.spy_host +
      "]"
  );

  try {
    makeEvmContractData(env);
    if (env.terraEnabled) {
      makeTerraContractData(env);
    }
  } catch (e: any) {
    logger.error("failed to connect to target contracts: %o", e);
    success = false;
  }

  if (success) {
    run_worker();
    spy_listen();
  }
}

function loadConfig(): [boolean, OurEnvironment] {
  if (!process.env.SPY_SERVICE_HOST) {
    logger.error("Missing environment variable SPY_SERVICE_HOST");
    return [false, undefined];
  }

  if (!process.env.ETH_PROVIDER) {
    logger.error("Missing environment variable ETH_PROVIDER");
    return [false, undefined];
  }
  if (!process.env.ETH_CONTRACT_ADDRESS) {
    logger.error("Missing environment variable ETH_CONTRACT_ADDRESS");
    return [false, undefined];
  }
  if (!process.env.ETH_TOKEN_BRIDGE_ADDRESS) {
    logger.error("Missing environment variable ETH_TOKEN_BRIDGE_ADDRESS");
    return [false, undefined];
  }

  if (!process.env.POLYGON_PROVIDER) {
    logger.error("Missing environment variable POLYGON_PROVIDER");
    return [false, undefined];
  }
  if (!process.env.POLYGON_CONTRACT_ADDRESS) {
    logger.error("Missing environment variable POLYGON_CONTRACT_ADDRESS");
    return [false, undefined];
  }
  if (!process.env.POLYGON_TOKEN_BRIDGE_ADDRESS) {
    logger.error("Missing environment variable POLYGON_TOKEN_BRIDGE_ADDRESS");
    return [false, undefined];
  }

  if (!process.env.WALLET_PRIVATE_KEY) {
    logger.error("Missing environment variable WALLET_PRIVATE_KEY");
    return [false, undefined];
  }

  let terraEnabled: boolean = false;
  if (process.env.TERRA_PROVIDER) {
    terraEnabled = true;

    if (!process.env.TERRA_CHAIN_ID) {
      logger.error("Missing environment variable WALLET_PRIVATE_KEY");
      return [false, undefined];
      throw "Missing environment variable TERRA_CHAIN_ID";
    }

    if (!process.env.TERRA_NAME) {
      logger.error("Missing environment variable WALLET_PRIVATE_KEY");
      return [false, undefined];
      throw "Missing environment variable TERRA_NAME";
    }

    if (!process.env.TERRA_WALLET_PRIVATE_KEY) {
      logger.error("Missing environment variable TERRA_WALLET_PRIVATE_KEY");
      return [false, undefined];
    }

    if (!process.env.TERRA_GAS_PRICE_URL) {
      logger.error("Missing environment variable TERRA_GAS_PRICE_URL");
      return [false, undefined];
    }

    if (!process.env.TERRA_CONTRACT_ADDRESS) {
      logger.error("Missing environment variable TERRA_CONTRACT_ADDRESS");
      return [false, undefined];
    }

    if (!process.env.TERRA_TOKEN_BRIDGE_ADDRESS) {
      logger.error("Missing environment variable TERRA_TOKEN_BRIDGE_ADDRESS");
      return [false, undefined];
    }
  }

  return [
    true,
    {
      spy_host: process.env.SPY_SERVICE_HOST,
      spy_filters: process.env.SPY_SERVICE_FILTERS,

      eth_provider_url: process.env.ETH_PROVIDER,
      eth_contract_address: process.env.ETH_CONTRACT_ADDRESS,
      eth_token_bridge_address: process.env.ETH_TOKEN_BRIDGE_ADDRESS,

      polygon_provider_url: process.env.POLYGON_PROVIDER,
      polygon_contract_address: process.env.POLYGON_CONTRACT_ADDRESS,
      polygon_token_bridge_address: process.env.POLYGON_TOKEN_BRIDGE_ADDRESS,

      evm_wallet_private_key: process.env.WALLET_PRIVATE_KEY,

      terraEnabled: terraEnabled,
      terra_provider_url: process.env.TERRA_PROVIDER,
      terra_chain_id: process.env.TERRA_CHAIN_ID,
      terra_name: process.env.TERRA_NAME,
      terra_contract_address: process.env.TERRA_CONTRACT_ADDRESS,
      terra_token_bridge_address: process.env.TERRA_TOKEN_BRIDGE_ADDRESS,
      terra_wallet_private_key: process.env.TERRA_WALLET_PRIVATE_KEY,
      terra_gas_price_url: process.env.TERRA_GAS_PRICE_URL,
    },
  ];
}

async function spy_listen() {
  (async () => {
    var filter = {};
    if (env.spy_filters) {
      const parsedJsonFilters = eval(env.spy_filters);

      var myFilters = [];
      for (var i = 0; i < parsedJsonFilters.length; i++) {
        var myChainId = parseInt(parsedJsonFilters[i].chain_id) as ChainId;
        var myEmitterAddress = await encodeEmitterAddress(
          myChainId,
          parsedJsonFilters[i].emitter_address
        );
        var myEmitterFilter = {
          emitterFilter: {
            chainId: myChainId,
            emitterAddress: myEmitterAddress,
          },
        };
        logger.info(
          "adding filter: chainId: [" +
            myEmitterFilter.emitterFilter.chainId +
            "], emitterAddress: [" +
            myEmitterFilter.emitterFilter.emitterAddress +
            "]"
        );
        myFilters.push(myEmitterFilter);
      }

      logger.info("setting " + myFilters.length + " filters");
      filter = {
        filters: myFilters,
      };
    } else {
      logger.info("processing all signed VAAs");
    }

    const client = createSpyRPCServiceClient(env.spy_host);
    const stream = await subscribeSignedVAA(client, filter);

    stream.on("data", ({ vaaBytes }) => {
      processVaa(vaaBytes);
    });

    logger.info("swap_relay waiting for transfer signed VAAs");
  })();
}

async function encodeEmitterAddress(
  myChainId,
  emitterAddressStr
): Promise<string> {
  if (myChainId === CHAIN_ID_SOLANA) {
    return await getEmitterAddressSolana(emitterAddressStr);
  }

  if (myChainId === CHAIN_ID_TERRA) {
    return await getEmitterAddressTerra(emitterAddressStr);
  }

  return getEmitterAddressEth(emitterAddressStr);
}

async function processVaa(vaaBytes: string) {
  let receiveTime = new Date();
  logger.debug("processVaa");
  const { parse_vaa } = await importCoreWasm();
  const parsedVAA = parse_vaa(hexToUint8Array(vaaBytes));
  logger.debug("processVaa: parsedVAA: %o", parsedVAA);

  let emitter_address: string = uint8ArrayToHex(parsedVAA.emitter_address);

  let seqNumKey: string =
    parsedVAA.emitter_chain.toString() + ":" + emitter_address;
  let lastSeqNum = seqMap.get(seqNumKey);
  if (lastSeqNum) {
    if (lastSeqNum >= parsedVAA.sequence) {
      logger.debug(
        "ignoring duplicate: emitter: [" +
          seqNumKey +
          "], seqNum: " +
          parsedVAA.sequence
      );
      return;
    }
  }

  seqMap.set(seqNumKey, parsedVAA.sequence);

  let t3Payload: Type3Payload = null;
  try {
    t3Payload = decodeSignedVAAPayloadType3(parsedVAA);
  } catch (e) {
    logger.error("failed to parse type 3 vaa: %o", e);
    return;
  }

  if (t3Payload) {
    if (isOurContract(t3Payload.contractAddress)) {
      logger.info(
        "enqueuing type 3 vaa: emitter: [" +
          parsedVAA.emitter_chain +
          ":" +
          emitter_address +
          "], seqNum: " +
          parsedVAA.sequence +
          ", contractAddress: [" +
          t3Payload.contractAddress +
          "], relayerFee: [" +
          t3Payload.relayerFee +
          "],  swapFunctionType: [" +
          t3Payload.swapFunctionType +
          "], swapCurrencyType: [" +
          t3Payload.swapCurrencyType +
          "]"
      );

      await postVaa(vaaBytes, t3Payload, receiveTime);
    } else {
      logger.debug(
        "dropping type 3 vaa for unsupported contract: emitter: [" +
          parsedVAA.emitter_chain +
          ":" +
          emitter_address +
          "], seqNum: " +
          parsedVAA.sequence +
          ", contractAddress: [" +
          t3Payload.contractAddress +
          "], relayerFee: [" +
          t3Payload.relayerFee +
          "],  swapFunctionType: [" +
          t3Payload.swapFunctionType +
          "], swapCurrencyType: [" +
          t3Payload.swapCurrencyType +
          "]"
      );
    }
  } else {
    logger.debug(
      "dropping vaa: emitter: [" +
        parsedVAA.emitter_chain +
        ":" +
        emitter_address +
        "], seqNum: " +
        parsedVAA.sequence +
        " payloadType: " +
        parsedVAA.payload[0]
    );
  }
}

function decodeSignedVAAPayloadType3(parsedVAA: any): Type3Payload {
  const payload = Buffer.from(new Uint8Array(parsedVAA.payload));
  if (payload[0] !== 3) return undefined;

  logger.info("decodeSignedVAAPayloadType3: length: " + payload.length);
  if (payload.length < 101) {
    logger.error(
      "decodeSignedVAAPayloadType3: dropping type 3 vaa because the payload is too short to determine the target chain id, length: " +
        payload.length
    );
    return undefined;
  }

  const targetChainId = payload.readUInt16BE(99);
  logger.info("decodeSignedVAAPayloadType3: target ChainId: " + targetChainId);

  let contractAddress: string = "";
  let swapFunctionType: number = 0;
  let swapCurrencyType: number = 0;

  if (targetChainId === 3) {
    logger.info(
      "decodeSignedVAAPayloadType3: terraContractAddr: [" +
        payload.slice(67, 67 + 32).toString("hex") +
        "]"
    );
    logger.info(
      "decodeSignedVAAPayloadType3: terraContractAddr: [" +
        payload.slice(67, 67 + 32).toString() +
        "]"
    );

    contractAddress = payload.slice(67, 67 + 32).toString("hex");
  } else {
    if (payload.length < 262) {
      logger.error(
        "decodeSignedVAAPayloadType3: dropping type 3 vaa because the payload is too short to extract the contract fields, length: " +
          payload.length +
          ", target chain id: " +
          targetChainId
      );
      return undefined;
    }

    contractAddress = payload.slice(79, 79 + 20).toString("hex");
    swapFunctionType = payload.readUInt8(260);
    swapCurrencyType = payload.readUInt8(261);
  }

  return {
    targetChainId: targetChainId,
    contractAddress: payload.slice(79, 79 + 20).toString("hex"),
    relayerFee: ethers.BigNumber.from(payload.slice(101, 101 + 32)),
    swapFunctionType: swapFunctionType,
    swapCurrencyType: swapCurrencyType,
  };
}

function isOurContract(contractAddress: string): boolean {
  return isEvmContract(contractAddress) || isTerraContract(contractAddress);
}

async function postVaa(
  vaaBytes: any,
  t3Payload: Type3Payload,
  receiveTime: Date
) {
  let event: PendingEvent = {
    vaaBytes: vaaBytes,
    t3Payload: t3Payload,
    receiveTime: receiveTime,
  };

  await mutex.runExclusive(() => {
    pendingQueue.push(event);
    logger.debug(
      "posting event, there are now " + pendingQueue.length + " enqueued events"
    );
    if (condition) {
      logger.debug("hitting condition variable.");
      condition.complete(true);
    }
  });
}

const COND_VAR_TIMEOUT = 10000;

async function run_worker() {
  await mutex.runExclusive(async () => {
    await condition.wait(COND_VAR_TIMEOUT, callBack);
  });
}

async function callBack(err: any, result: any) {
  // logger.debug(
  //   "entering callback, pendingEvents: " +
  //     pendingQueue.length +
  //     ", err: %o, result: %o",
  //   err,
  //   result
  // );

  let done = false;
  do {
    let currEvent: PendingEvent = null;

    await mutex.runExclusive(async () => {
      condition = null;
      if (pendingQueue.length !== 0) {
        currEvent = pendingQueue[0];
        pendingQueue.pop();
      } else {
        done = true;
        condition = new CondVar();
        await condition.wait(COND_VAR_TIMEOUT, callBack);
      }
    });

    if (currEvent) {
      logger.debug("in callback, relaying event.");
      try {
        await relayVaa(currEvent.vaaBytes, currEvent.t3Payload);
      } catch (e) {
        logger.error("failed to relay type 3 vaa: %o", e);
      }

      await mutex.runExclusive(async () => {
        if (pendingQueue.length === 0) {
          logger.debug(
            "in callback, no more pending events, rearming the condition."
          );
          done = true;
          condition = new CondVar();
          await condition.wait(COND_VAR_TIMEOUT, callBack);
        } else {
          logger.debug(
            "in callback, there are " + pendingQueue.length + " pending events."
          );
        }
      });
    }
  } while (!done);

  // logger.debug("leaving callback.");
}

async function relayVaa(vaaBytes: string, t3Payload: Type3Payload) {
  const signedVaaArray = hexToUint8Array(vaaBytes);

  if (t3Payload.targetChainId === 3) {
    relayVaaToTerra(t3Payload, signedVaaArray);
    return;
  }

  relayVaaToEvm(signedVaaArray, t3Payload);
}

///////////////////////////////// Start of logger stuff ///////////////////////////////////////////

function initLogger() {
  const winston = require("winston");

  let useConsole: boolean = true;
  let logFileName: string = "";
  if (process.env.LOG_DIR) {
    useConsole = false;
    logFileName =
      process.env.LOG_DIR + "/swap_relay." + new Date().toISOString() + ".log";
  }

  let logLevel = "info";
  if (process.env.LOG_LEVEL) {
    logLevel = process.env.LOG_LEVEL;
  }

  let transport: any;
  if (useConsole) {
    console.log("swap_relay is logging to the console at level [%s]", logLevel);

    transport = new winston.transports.Console({
      level: logLevel,
    });
  } else {
    console.log(
      "swap_relay is logging to [%s] at level [%s]",
      logFileName,
      logLevel
    );

    transport = new winston.transports.File({
      filename: logFileName,
      level: logLevel,
    });
  }

  const logConfiguration = {
    transports: [transport],
    format: winston.format.combine(
      winston.format.splat(),
      winston.format.simple(),
      winston.format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss.SSS",
      }),
      winston.format.printf(
        (info: any) => `${[info.timestamp]}|${info.level}|${info.message}`
      )
    ),
  };

  logger = winston.createLogger(logConfiguration);
}
