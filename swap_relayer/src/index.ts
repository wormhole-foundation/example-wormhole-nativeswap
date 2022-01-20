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
  redeemOnEth,
} from "@certusone/wormhole-sdk";

import {
  importCoreWasm,
  setDefaultWasm,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";

import {
  createSpyRPCServiceClient,
  subscribeSignedVAA,
} from "@certusone/wormhole-spydk";

let logger: any;

let configFile: string = ".env.sample";
if (process.env.SWAP_RELAY_CONFIG) {
  configFile = process.env.SWAP_RELAY_CONFIG;
}

console.log("Loading config file [%s]", configFile);
require("dotenv").config({ path: configFile });

initLogger();

type OurEnvironment = {
  spy_host: string;
  spy_filters: string;
  target_chain_id: number;
  target_node_url: string;
  target_private_key: string;
  target_contract_address: string;
};

setDefaultWasm("node");

let success: boolean;
let env: OurEnvironment;
[success, env] = loadConfig();

if (success) {
  logger.info(
    "swap_relay starting up, will listen for signed VAAs from [" +
      env.spy_host +
      "]"
  );

  logger.info(
    "will relay to EVM chainId: [" +
      env.target_chain_id +
      "], nodeUrl: [" +
      env.target_node_url +
      "], contractAddress: [" +
      env.target_contract_address +
      "]"
  );

  spy_listen();
}

function loadConfig(): [boolean, OurEnvironment] {
  if (!process.env.SPY_SERVICE_HOST) {
    logger.error("Missing environment variable SPY_SERVICE_HOST");
    return [false, undefined];
  }
  if (!process.env.EVM_CHAIN_ID) {
    logger.error("Missing environment variable EVM_CHAIN_ID");
    return [false, undefined];
  }
  if (!process.env.EVM_NODE_URL) {
    logger.error("Missing environment variable EVM_NODE_URL");
    return [false, undefined];
  }
  if (!process.env.EVM_PRIVATE_KEY) {
    logger.error("Missing environment variable EVM_PRIVATE_KEY");
    return [false, undefined];
  }
  if (!process.env.EVM_CONTRACT_ADDRESS) {
    logger.error("Missing environment variable EVM_CONTRACT_ADDRESS");
    return [false, undefined];
  }

  return [
    true,
    {
      spy_host: process.env.SPY_SERVICE_HOST,
      spy_filters: process.env.SPY_SERVICE_FILTERS,
      target_chain_id: parseInt(process.env.EVM_CHAIN_ID),
      target_node_url: process.env.EVM_NODE_URL,
      target_private_key: process.env.EVM_PRIVATE_KEY,
      target_contract_address: process.env.EVM_CONTRACT_ADDRESS,
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

type Type3Payload = {
  contractAddress: string;
  relayerFee: ethers.BigNumber;
  swapFunctionType: number;
  swapCurrencyType: number;
};

async function processVaa(vaaBytes) {
  logger.debug("processVaa");
  const { parse_vaa } = await importCoreWasm();
  const parsedVAA = parse_vaa(hexToUint8Array(vaaBytes));
  logger.debug("processVaa: parsedVAA: %o", parsedVAA);

  let emitter_chain_id: number = parsedVAA.emitter_chain;
  let emitter_address: string = uint8ArrayToHex(parsedVAA.emitter_address);
  let sequence: number = parsedVAA.sequence;
  let payload_type: number = parsedVAA.payload[0];

  let t3Payload = decodeSignedVAAPayloadType3(parsedVAA);
  if (t3Payload) {
    logger.info(
      "relaying type 3: emitter: [" +
        emitter_chain_id +
        ":" +
        emitter_address +
        "], seqNum: " +
        sequence +
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

    try {
      //await relayVaa(vaaBytes);
    } catch (e) {
      logger.error("failed to relay type 3 vaa: %o", e);
    }
  } else {
    logger.info(
      "dropping vaa: emitter: [" +
        emitter_chain_id +
        ":" +
        emitter_address +
        "], seqNum: " +
        sequence +
        " payloadType: " +
        payload_type
    );
  }
}

function decodeSignedVAAPayloadType3(parsedVAA: any): Type3Payload {
  const payload = Buffer.from(new Uint8Array(parsedVAA.payload));
  const version = payload.readUInt8(0);

  // if (version !== 1) {
  //   return undefined;
  // }
  // return true;

  if (version !== 3) {
    return undefined;
  }
  return {
    contractAddress: payload.slice(79, 79 + 20).toString("hex"),
    relayerFee: ethers.BigNumber.from(payload.slice(101, 101 + 32)),
    swapFunctionType: payload.readUInt8(260),
    swapCurrencyType: payload.readUInt8(261),
  };
}

import { ethers } from "ethers";

async function relayVaa(vaaBytes: string) {
  const signedVaaArray = hexToUint8Array(vaaBytes);
  const provider = new ethers.providers.WebSocketProvider(env.target_node_url);

  const signer = new ethers.Wallet(env.target_private_key, provider);
  const receipt = await redeemOnEth(
    env.target_contract_address,
    signer,
    signedVaaArray
  );

  let success = await getIsTransferCompletedEth(
    env.target_contract_address,
    provider,
    signedVaaArray
  );

  provider.destroy();

  logger.info(
    "redeemed on evm: success: " + success + ", receipt: %o",
    receipt
  );
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
