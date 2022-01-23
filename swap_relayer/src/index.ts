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

import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM } from "../../react/src/addresses/goerli";
import { SWAP_CONTRACT_ADDRESS as CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON } from "../../react/src/addresses/mumbai";
import { abi as SWAP_CONTRACT_V2_ABI } from "../../react/src/abi/contracts/CrossChainSwapV2.json";
import { abi as SWAP_CONTRACT_V3_ABI } from "../../react/src/abi/contracts/CrossChainSwapV3.json";

import * as swap from "../../react/src/swapper/util";

let logger: any;

let configFile: string = ".env";
if (process.env.SWAP_RELAY_CONFIG) {
  configFile = process.env.SWAP_RELAY_CONFIG;
}

console.log("Loading config file [%s]", configFile);
require("dotenv").config({ path: configFile });

initLogger();

type OurEnvironment = {
  spy_host: string;
  spy_filters: string;
  eth_provider_url: string;
  polygon_provider_url: string;
  wallet_private_key: string;
  eth_contract_address: string;
  polygon_contract_address: string;
  eth_token_bridge_address: string;
  polygon_token_bridge_address: string;
};

type TargetContractData = {
  name: string;
  contractAddress: string;
  tokenBridgeAddress: string;
  contract: ethers.Contract;
  provider: ethers.providers.StaticJsonRpcProvider;
  wallet: ethers.Wallet;
  contractWithSigner: ethers.Contract;
};

type Type3Payload = {
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

let ethContractData: TargetContractData = null;
let polygonContractData: TargetContractData = null;
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
    ethContractData = makeEthContractData();
    polygonContractData = makePolygonContractData();
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
  if (!process.env.POLYGON_PROVIDER) {
    logger.error("Missing environment variable POLYGON_PROVIDER");
    return [false, undefined];
  }
  if (!process.env.WALLET_PRIVATE_KEY) {
    logger.error("Missing environment variable WALLET_PRIVATE_KEY");
    return [false, undefined];
  }
  if (!process.env.ETH_TOKEN_BRIDGE_ADDRESS) {
    logger.error("Missing environment variable ETH_TOKEN_BRIDGE_ADDRESS");
    return [false, undefined];
  }
  if (!process.env.POLYGON_TOKEN_BRIDGE_ADDRESS) {
    logger.error("Missing environment variable POLYGON_TOKEN_BRIDGE_ADDRESS");
    return [false, undefined];
  }

  return [
    true,
    {
      spy_host: process.env.SPY_SERVICE_HOST,
      spy_filters: process.env.SPY_SERVICE_FILTERS,
      eth_provider_url: process.env.ETH_PROVIDER,
      polygon_provider_url: process.env.POLYGON_PROVIDER,
      wallet_private_key: process.env.WALLET_PRIVATE_KEY,
      eth_contract_address: process.env.ETH_CONTRACT_ADDRESS,
      polygon_contract_address: process.env.POLYGON_CONTRACT_ADDRESS,
      eth_token_bridge_address: process.env.ETH_TOKEN_BRIDGE_ADDRESS,
      polygon_token_bridge_address: process.env.POLYGON_TOKEN_BRIDGE_ADDRESS,
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

  let payload_type: number = parsedVAA.payload[0];

  let t3Payload = decodeSignedVAAPayloadType3(parsedVAA);
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
        payload_type
    );
  }
}

function decodeSignedVAAPayloadType3(parsedVAA: any): Type3Payload {
  const payload = Buffer.from(new Uint8Array(parsedVAA.payload));
  const version = payload.readUInt8(0);

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

function isOurContract(contractAddress: string): boolean {
  return (
    contractAddress === ethContractData.contractAddress ||
    contractAddress === polygonContractData.contractAddress
  );
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

// Ethereum (Goerli) set up
function makeEthContractData(): TargetContractData {
  let overridden: boolean = false;
  let contractAddress: string = CROSSCHAINSWAP_CONTRACT_ADDRESS_ETHEREUM;
  if (env.eth_contract_address) {
    contractAddress = env.eth_contract_address;
    overridden = true;
  }

  contractAddress = contractAddress.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  if (overridden) {
    logger.info(
      "Connecting to Ethereum: overriding contract address: [" +
        contractAddress +
        "], node: [" +
        env.eth_provider_url +
        "], token bridge address: [" +
        env.eth_token_bridge_address +
        "]"
    );
  } else {
    logger.info(
      "Connecting to Ethereum: contract address: [" +
        contractAddress +
        "], node: [" +
        env.eth_provider_url +
        "], token bridge address: [" +
        env.eth_token_bridge_address +
        "]"
    );
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    env.eth_provider_url
  );

  const contract = new ethers.Contract(
    contractAddress,
    SWAP_CONTRACT_V3_ABI,
    provider
  );

  const wallet = new ethers.Wallet(env.wallet_private_key, provider);
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
function makePolygonContractData(): TargetContractData {
  let overridden: boolean = false;
  let contractAddress: string = CROSSCHAINSWAP_CONTRACT_ADDRESS_POLYGON;
  if (env.polygon_contract_address) {
    contractAddress = env.polygon_contract_address;
    overridden = true;
  }

  contractAddress = contractAddress.toLowerCase();
  if (contractAddress.search("0x") == 0) {
    contractAddress = contractAddress.substring(2);
  }

  if (overridden) {
    logger.info(
      "Connecting to Polygon: overriding contract address: [" +
        contractAddress +
        "], node: [" +
        env.polygon_provider_url +
        "], token bridge address: [" +
        env.polygon_token_bridge_address +
        "]"
    );
  } else {
    logger.info(
      "Connecting to Polygon: contract address: [" +
        contractAddress +
        "], node: [" +
        env.polygon_provider_url +
        "], token bridge address: [" +
        env.polygon_token_bridge_address +
        "]"
    );
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    env.polygon_provider_url
  );

  const contract = new ethers.Contract(
    contractAddress,
    SWAP_CONTRACT_V2_ABI,
    provider
  );

  const wallet = new ethers.Wallet(env.wallet_private_key, provider);
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

async function relayVaa(vaaBytes: string, t3Payload: Type3Payload) {
  const signedVaaArray = hexToUint8Array(vaaBytes);

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
    await relayVaaToChain(
      t3Payload,
      ethContractData,
      signedVaaArray,
      exactIn,
      native
    );
  } else if (
    t3Payload.contractAddress === polygonContractData.contractAddress
  ) {
    await relayVaaToChain(
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

async function relayVaaToChain(
  t3Payload: Type3Payload,
  tcd: TargetContractData,
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

  if (await isRedeemed(t3Payload, tcd, signedVaaArray)) {
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
    if (await isRedeemed(t3Payload, tcd, signedVaaArray)) {
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

  if (await isRedeemed(t3Payload, tcd, signedVaaArray)) {
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

async function isRedeemed(
  t3Payload: Type3Payload,
  tcd: TargetContractData,
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
