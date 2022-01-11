import {
  ChainId,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
} from "@certusone/wormhole-sdk";
import ethIcon from "../icons/eth.svg";
import polygonIcon from "../icons/polygon.svg";

export interface TokenInfo {
  id: string;
  name: string;
  address: string;
  chainId: ChainId;
  logo: string;
}

export const WMATIC_TOKEN_INFO: TokenInfo = {
  id: "WMATIC",
  name: "WMATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  chainId: CHAIN_ID_POLYGON,
  logo: polygonIcon,
};

export const WETH_TOKEN_INFO: TokenInfo = {
  id: "WETH",
  name: "WETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  chainId: CHAIN_ID_ETH,
  logo: ethIcon,
};

export const TOKEN_INFOS = [WMATIC_TOKEN_INFO, WETH_TOKEN_INFO];

export const ETH_NETWORK_CHAIN_ID = 5;

export const POLYGON_NETWORK_CHAIN_ID = 80001;

export const getEvmChainId = (chainId: ChainId) =>
  chainId === CHAIN_ID_ETH
    ? ETH_NETWORK_CHAIN_ID
    : chainId === CHAIN_ID_POLYGON
    ? POLYGON_NETWORK_CHAIN_ID
    : undefined;

export const RELAYER_FEE_UST = "0.0001";

export const WORMHOLE_RPC_HOSTS = [
  "https://wormhole-v2-testnet-api.certus.one",
];

export const CORE_BRIDGE_ADDRESS_ETHEREUM =
  "0x706abc4E45D419950511e474C7B9Ed348A4a716c";

export const CORE_BRIDGE_ADDRESS_POLYGON =
  "0x0CBE91CF822c73C2315FB05100C2F714765d5c20";

export const TOKEN_BRIDGE_ADDRESS_ETHEREUM =
  "0xF890982f9310df57d00f659cf4fd87e65adEd8d7";

export const TOKEN_BRIDGE_ADDRESS_POLYGON =
  "0x377D55a7928c046E18eEbb61977e714d2a76472a";

export const QUICKSWAP_FACTORY_ADDRESS =
  "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";

export const UNISWAP_V3_FACTORY_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";

export const APPROVAL_GAS_LIMIT = "100000";
