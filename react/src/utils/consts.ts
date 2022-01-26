import {
  ChainId,
  CHAIN_ID_ETH as WORMHOLE_CHAIN_ID_ETHEREUM,
  CHAIN_ID_POLYGON as WORMHOLE_CHAIN_ID_POLYGON,
  CHAIN_ID_TERRA as WORMHOLE_CHAIN_ID_TERRA,
} from "@certusone/wormhole-sdk";
//import ethIcon from "../icons/eth.svg";
//import polygonIcon from "../icons/polygon.svg";

const ethIcon = undefined;
const polygonIcon = undefined;
const ustIcon = undefined;

export {
  WORMHOLE_CHAIN_ID_ETHEREUM,
  WORMHOLE_CHAIN_ID_POLYGON,
  WORMHOLE_CHAIN_ID_TERRA,
};

export interface TokenInfo {
  name: string;
  address: string;
  chainId: ChainId;
  logo: string;
  isNative: boolean;
  maxAmount: number;
  ustPairedAddress: string;
}

export const MATIC_TOKEN_INFO: TokenInfo = {
  name: "MATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889", // used to compute quote
  chainId: WORMHOLE_CHAIN_ID_POLYGON,
  logo: polygonIcon,
  isNative: true,
  maxAmount: 0.1,
  ustPairedAddress: "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c",
};

export const WMATIC_TOKEN_INFO: TokenInfo = {
  name: "WMATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  chainId: WORMHOLE_CHAIN_ID_POLYGON,
  logo: polygonIcon,
  isNative: false,
  maxAmount: 0.1,
  ustPairedAddress: "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c",
};

export const ETH_TOKEN_INFO: TokenInfo = {
  name: "ETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // used to compute quote
  chainId: WORMHOLE_CHAIN_ID_ETHEREUM,
  logo: ethIcon,
  isNative: true,
  maxAmount: 0.01,
  ustPairedAddress: "0x36Ed51Afc79619b299b238898E72ce482600568a",
};

export const WETH_TOKEN_INFO: TokenInfo = {
  name: "WETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  chainId: WORMHOLE_CHAIN_ID_ETHEREUM,
  logo: ethIcon,
  isNative: false,
  maxAmount: 0.01,
  ustPairedAddress: "0x36Ed51Afc79619b299b238898E72ce482600568a",
};

export const UST_TOKEN_INFO: TokenInfo = {
  name: "UST",
  address: "uusd",
  chainId: WORMHOLE_CHAIN_ID_TERRA,
  logo: ustIcon,
  isNative: false,
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

// evm handling
export const EVM_ETH_NETWORK_CHAIN_ID = 5;
export const EVM_POLYGON_NETWORK_CHAIN_ID = 80001;

export const getEvmChainId = (chainId: ChainId) =>
  chainId === WORMHOLE_CHAIN_ID_ETHEREUM
    ? EVM_ETH_NETWORK_CHAIN_ID
    : chainId === WORMHOLE_CHAIN_ID_POLYGON
    ? EVM_POLYGON_NETWORK_CHAIN_ID
    : undefined;

// misc
export const RELAYER_FEE_UST = "0.25";

export const WORMHOLE_RPC_HOSTS = [
  "https://wormhole-v2-testnet-api.certus.one",
];

export const CORE_BRIDGE_ADDRESS_ETHEREUM =
  "0x706abc4E45D419950511e474C7B9Ed348A4a716c";

export const CORE_BRIDGE_ADDRESS_POLYGON =
  "0x0CBE91CF822c73C2315FB05100C2F714765d5c20";

export const CORE_BRIDGE_ADDRESS_TERRA = undefined;

export const TOKEN_BRIDGE_ADDRESS_ETHEREUM =
  "0xF890982f9310df57d00f659cf4fd87e65adEd8d7";

export const TOKEN_BRIDGE_ADDRESS_POLYGON =
  "0x377D55a7928c046E18eEbb61977e714d2a76472a";

export const TOKEN_BRIDGE_ADDRESS_TERRA = undefined;

export const QUICKSWAP_FACTORY_ADDRESS =
  "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";

export const UNISWAP_V3_FACTORY_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";

export const APPROVAL_GAS_LIMIT = "100000";
