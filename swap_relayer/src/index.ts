import {
  ChainId,
  CHAIN_ID_SOLANA,
  CHAIN_ID_TERRA,
  hexToUint8Array,
  uint8ArrayToHex,
  getEmitterAddressEth,
  getEmitterAddressSolana,
  getEmitterAddressTerra,
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
};

type TargetContractData = {
  contractAddress: string;
  contract: ethers.Contract;
  provider: ethers.providers.StaticJsonRpcProvider;
  wallet: ethers.Wallet;
  contractWithSigner: ethers.Contract;
};

setDefaultWasm("node");

let success: boolean;
let env: OurEnvironment;
[success, env] = loadConfig();

let ethContractData: TargetContractData = null;
let polygonContractData: TargetContractData = null;

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
      await relayVaa(vaaBytes, t3Payload);
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
      "Connecting to Ethereum: node [" +
        env.eth_provider_url +
        "], overriding contract address to [" +
        contractAddress +
        "]"
    );
  } else {
    logger.info(
      "Connecting to Ethereum: node [" +
        env.eth_provider_url +
        "], contract address [" +
        contractAddress +
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
    contractAddress: contractAddress,
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
      "Connecting to Polygon: node [" +
        env.polygon_provider_url +
        "], overriding contract address to [" +
        contractAddress +
        "]"
    );
  } else {
    logger.info(
      "Connecting to Polygon: node [" +
        env.polygon_provider_url +
        "], contract address [" +
        contractAddress +
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
    contractAddress: contractAddress,
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
      "unable to relay vaa: unsupported swapFunctionType: [" +
        t3Payload.swapFunctionType +
        "]"
    );
  }

  let native: boolean = false;
  if (t3Payload.swapCurrencyType === 1) {
    native = true;
  } else if (t3Payload.swapCurrencyType !== 2) {
    logger.error(
      "unable to relay vaa: unsupported swapCurrencyType: [" +
        t3Payload.swapCurrencyType +
        "]"
    );
  }

  logger.info(
    "relayVaa: contractAddress: [" +
      t3Payload.contractAddress +
      "], ethContract: [" +
      ethContractData.contractAddress +
      "], polygonContract[" +
      polygonContractData.contractAddress +
      "]"
  );

  if (t3Payload.contractAddress === ethContractData.contractAddress) {
    await relayVaaToEth(signedVaaArray, exactIn, native);
  } else if (
    t3Payload.contractAddress === polygonContractData.contractAddress
  ) {
    await relayVaaToPolygon(signedVaaArray, exactIn, native);
  } else {
    logger.error(
      "unable to relay vaa: unsupported contract: [" +
        t3Payload.contractAddress +
        "]"
    );
  }
}

async function relayVaaToEth(
  signedVaaArray: Uint8Array,
  exactIn: boolean,
  native: boolean
) {
  logger.info("relayVaaToEth: exactIn: " + exactIn + ", native: " + native);
  if (exactIn) {
    if (native) {
      await swap
        .swapExactInFromVaaNativeV3(
          ethContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToEth: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToEth: transaction failed: %o",
            error.transactionHash
          );
        });
    } else {
      await swap
        .swapExactInFromVaaTokenV3(
          ethContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToEth: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToEth: transaction failed: %o",
            error.transactionHash
          );
        });
    }
  } else {
    if (native) {
      await swap
        .swapExactOutFromVaaNativeV3(
          ethContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToEth: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToEth: transaction failed: %o",
            error.transactionHash
          );
        });
    } else {
      await swap
        .swapExactOutFromVaaTokenV3(
          ethContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToEth: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToEth: transaction failed: %o",
            error.transactionHash
          );
        });
    }
  }
}

async function relayVaaToPolygon(
  signedVaaArray: Uint8Array,
  exactIn: boolean,
  native: boolean
) {
  logger.info("relayVaaToPolygon: exactIn: " + exactIn + ", native: " + native);
  if (exactIn) {
    if (native) {
      await swap
        .swapExactInFromVaaNativeV2(
          polygonContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToPolygon: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToPolygon: transaction failed: %o",
            error.transactionHash
          );
        });
    } else {
      await swap
        .swapExactInFromVaaTokenV2(
          polygonContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToPolygon: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToPolygon: transaction failed: %o",
            error.transactionHash
          );
        });
    }
  } else {
    if (native) {
      await swap
        .swapExactOutFromVaaNativeV2(
          polygonContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToPolygon: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToPolygon: transaction failed: %o",
            error.transactionHash
          );
        });
    } else {
      await swap
        .swapExactOutFromVaaTokenV2(
          polygonContractData.contractWithSigner,
          signedVaaArray
        )
        .then((receipt) => {
          logger.info("relayVaaToPolygon: %o", receipt.transactionHash);
        })
        .catch((error) => {
          logger.error(
            "relayVaaToPolygon: transaction failed: %o",
            error.transactionHash
          );
        });
    }
  }
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
