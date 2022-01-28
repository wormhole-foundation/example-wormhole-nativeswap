import {
  ChainId,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
  CHAIN_ID_TERRA,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
} from "@certusone/wormhole-sdk";

//import ethIcon from "../icons/eth.svg";
//import polygonIcon from "../icons/polygon.svg";
//import terraIcon from "../icons/terra.svg";

const ethIcon = "";
const polygonIcon = "";
const bnbIcon = "";
const avaxIcon = "";
const terraIcon = "";

export interface TokenInfo {
  name: string;
  address: string;
  chainId: ChainId;
  logo: string;
  isNative: boolean;
  maxAmount: number;
  ustPairedAddress: string | undefined;
}

// matic
export const MATIC_TOKEN_INFO: TokenInfo = {
  name: "MATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889", // used to compute quote
  chainId: CHAIN_ID_POLYGON,
  logo: polygonIcon,
  isNative: true,
  maxAmount: 0.1,
  ustPairedAddress: "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c",
};

export const WMATIC_TOKEN_INFO: TokenInfo = {
  name: "WMATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  chainId: CHAIN_ID_POLYGON,
  logo: polygonIcon,
  isNative: false,
  maxAmount: 0.1,
  ustPairedAddress: "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c",
};

// eth
export const ETH_TOKEN_INFO: TokenInfo = {
  name: "ETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // used to compute quote
  chainId: CHAIN_ID_ETH,
  logo: ethIcon,
  isNative: true,
  maxAmount: 0.01,
  ustPairedAddress: "0x36Ed51Afc79619b299b238898E72ce482600568a",
};

export const WETH_TOKEN_INFO: TokenInfo = {
  name: "WETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  chainId: CHAIN_ID_ETH,
  logo: ethIcon,
  isNative: false,
  maxAmount: 0.01,
  ustPairedAddress: "0x36Ed51Afc79619b299b238898E72ce482600568a",
};

// avax
export const AVAX_TOKEN_INFO: TokenInfo = {
  name: "AVAX",
  address: "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3",
  chainId: CHAIN_ID_AVAX,
  logo: avaxIcon,
  isNative: true,
  maxAmount: 0.01,
  ustPairedAddress: "0xe09ed38e5cd1014444846f62376ac88c5232cde9",
};

export const WAVAX_TOKEN_INFO: TokenInfo = {
  name: "WAVAX",
  address: "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3",
  chainId: CHAIN_ID_AVAX,
  logo: avaxIcon,
  isNative: false,
  maxAmount: 0.01,
  ustPairedAddress: "0xe09ed38e5cd1014444846f62376ac88c5232cde9",
};

// bnb
export const BNB_TOKEN_INFO: TokenInfo = {
  name: "BNB",
  address: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  chainId: CHAIN_ID_BSC,
  logo: bnbIcon,
  isNative: true,
  maxAmount: 0.01,
  ustPairedAddress: "0x7b8eae1e85c8b189ee653d3f78733f4f788bb2c1",
};

export const WBNB_TOKEN_INFO: TokenInfo = {
  name: "WBNB",
  address: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  chainId: CHAIN_ID_BSC,
  logo: bnbIcon,
  isNative: false,
  maxAmount: 0.01,
  ustPairedAddress: "0x7b8eae1e85c8b189ee653d3f78733f4f788bb2c1",
};

// ust
export const UST_TOKEN_INFO: TokenInfo = {
  name: "UST",
  address: "uusd",
  chainId: CHAIN_ID_TERRA,
  logo: terraIcon,
  isNative: true, // TODO: change?
  maxAmount: 10.0,
  ustPairedAddress: undefined,
};

export const TOKEN_INFOS = [
  MATIC_TOKEN_INFO,
  WMATIC_TOKEN_INFO,
  ETH_TOKEN_INFO,
  WETH_TOKEN_INFO,
  UST_TOKEN_INFO,
];

export const getSupportedSwaps = (tokenInfo: TokenInfo) => {
  switch (tokenInfo) {
    case MATIC_TOKEN_INFO:
      return [ETH_TOKEN_INFO, UST_TOKEN_INFO];
    case WMATIC_TOKEN_INFO:
      return [WETH_TOKEN_INFO];
    case ETH_TOKEN_INFO:
      return [MATIC_TOKEN_INFO, UST_TOKEN_INFO];
    case WETH_TOKEN_INFO:
      return [WMATIC_TOKEN_INFO];
    case UST_TOKEN_INFO:
      return [ETH_TOKEN_INFO, MATIC_TOKEN_INFO];
  }
  return [];
};

export const EVM_ETH_NETWORK_CHAIN_ID = 5;
export const EVM_POLYGON_NETWORK_CHAIN_ID = 80001;
export const EVM_AVAX_NETWORK_CHAIN_ID = 43113;
export const EVM_BSC_NETWORK_CHAIN_ID = 97;

export function getEvmChainId(chainId: ChainId): number {
  switch (chainId) {
    case CHAIN_ID_ETH: {
      return EVM_ETH_NETWORK_CHAIN_ID;
    }
    case CHAIN_ID_POLYGON: {
      return EVM_POLYGON_NETWORK_CHAIN_ID;
    }
    case CHAIN_ID_AVAX: {
      return EVM_AVAX_NETWORK_CHAIN_ID;
    }
    case CHAIN_ID_BSC: {
      return EVM_BSC_NETWORK_CHAIN_ID;
    }
    default: {
      return undefined;
    }
  }
}

export const RELAYER_FEE_UST = "0.25";

export const WORMHOLE_RPC_HOSTS = [
  "https://wormhole-v2-testnet-api.certus.one",
];

// core bridge
export const CORE_BRIDGE_ADDRESS_ETHEREUM =
  "0x706abc4E45D419950511e474C7B9Ed348A4a716c";

export const CORE_BRIDGE_ADDRESS_POLYGON =
  "0x0CBE91CF822c73C2315FB05100C2F714765d5c20";

export const CORE_BRIDGE_ADDRESS_AVALANCHE =
  "0x7bbcE28e64B3F8b84d876Ab298393c38ad7aac4C";

export const CORE_BRIDGE_ADDRESS_BSC =
  "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D";

export const CORE_BRIDGE_ADDRESS_TERRA =
  "terra1pd65m0q9tl3v8znnz5f5ltsfegyzah7g42cx5v";

// token bridge
export const TOKEN_BRIDGE_ADDRESS_ETHEREUM =
  "0xF890982f9310df57d00f659cf4fd87e65adEd8d7";

export const TOKEN_BRIDGE_ADDRESS_POLYGON =
  "0x377D55a7928c046E18eEbb61977e714d2a76472a";

export const TOKEN_BRIDGE_ADDRESS_BSC =
  "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

export const TOKEN_BRIDGE_ADDRESS_AVALANCHE =
  "0x61E44E506Ca5659E6c0bba9b678586fA2d729756";

export const TOKEN_BRIDGE_ADDRESS_TERRA =
  "terra1pseddrv0yfsn76u4zxrjmtf45kdlmalswdv39a";

// gas
export const APPROVAL_GAS_LIMIT = "100000";
