import {
  ChainId,
  CHAIN_ID_ETH,
  CHAIN_ID_POLYGON,
  CHAIN_ID_TERRA,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_SOLANA,
} from "@certusone/wormhole-sdk";
import { clusterApiUrl } from "@solana/web3.js";

export const EVM_POLYGON_NETWORK_CHAIN_ID = 80001;
export const EVM_ETH_NETWORK_CHAIN_ID = 5;
export const EVM_AVAX_NETWORK_CHAIN_ID = 43113;
export const EVM_BSC_NETWORK_CHAIN_ID = 97;

export interface TokenInfo {
  name: string;
  address: string;
  chainId: ChainId;
  evmChainId: number | undefined;
  maxAmount: number;
  ustPairedAddress: string | undefined;
}

export const MATIC_TOKEN_INFO: TokenInfo = {
  name: "MATIC",
  address: "0x9c3c9283d3e44854697cd22d3faa240cfb032889",
  chainId: CHAIN_ID_POLYGON,
  evmChainId: EVM_POLYGON_NETWORK_CHAIN_ID,
  //logo: polygonIcon,
  maxAmount: 0.1,
  ustPairedAddress: "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c",
};

export const ETH_TOKEN_INFO: TokenInfo = {
  name: "ETH",
  address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  chainId: CHAIN_ID_ETH,
  evmChainId: EVM_ETH_NETWORK_CHAIN_ID,
  //logo: ethIcon,
  maxAmount: 0.01,
  ustPairedAddress: "0x36Ed51Afc79619b299b238898E72ce482600568a",
};

export const AVAX_TOKEN_INFO: TokenInfo = {
  name: "AVAX",
  address: "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3",
  chainId: CHAIN_ID_AVAX,
  evmChainId: EVM_AVAX_NETWORK_CHAIN_ID,
  //logo: avaxIcon,
  maxAmount: 0.01,
  ustPairedAddress: "0xe09ed38e5cd1014444846f62376ac88c5232cde9",
};

export const BNB_TOKEN_INFO: TokenInfo = {
  name: "BNB",
  address: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  chainId: CHAIN_ID_BSC,
  evmChainId: EVM_BSC_NETWORK_CHAIN_ID,
  //logo: bscIcon,
  maxAmount: 0.01,
  ustPairedAddress: "0x7b8eae1e85c8b189ee653d3f78733f4f788bb2c1",
};

export const UST_TOKEN_INFO: TokenInfo = {
  name: "UST",
  address: "uusd",
  chainId: CHAIN_ID_TERRA,
  evmChainId: undefined,
  //logo: terraIcon,
  maxAmount: 10.0,
  ustPairedAddress: undefined,
};

export const SOL_UST_TOKEN_INFO: TokenInfo = {
  name: "SOL UST",
  address: "5Dmmc5CC6ZpKif8iN5DSY9qNYrWJvEKcX2JrxGESqRMu",
  chainId: CHAIN_ID_SOLANA,
  evmChainId: undefined,
  //logo: solIcon,
  maxAmount: 0.01,
  ustPairedAddress: undefined,
};

export const TOKEN_INFOS = [
  MATIC_TOKEN_INFO,
  ETH_TOKEN_INFO,
  AVAX_TOKEN_INFO,
  BNB_TOKEN_INFO,
  // TODO: support swaps from/to terra
  // UST_TOKEN_INFO,
  // TODO: support swaps from/to Solana
  SOL_UST_TOKEN_INFO,
];

export const getSupportedSwaps = (tokenInfo: TokenInfo) => {
  return TOKEN_INFOS.filter((x) => x !== tokenInfo);
};

export const getEvmChainId = (chainId: ChainId): number | undefined => {
  switch (chainId) {
    case CHAIN_ID_ETH:
      return EVM_ETH_NETWORK_CHAIN_ID;
    case CHAIN_ID_POLYGON:
      return EVM_POLYGON_NETWORK_CHAIN_ID;
    case CHAIN_ID_AVAX:
      return EVM_AVAX_NETWORK_CHAIN_ID;
    case CHAIN_ID_BSC:
      return EVM_BSC_NETWORK_CHAIN_ID;
    default:
      return undefined;
  }
};

export const getChainName = (chainId: ChainId) => {
  switch (chainId) {
    case CHAIN_ID_ETH:
      return "Ethereum";
    case CHAIN_ID_POLYGON:
      return "Polygon";
    case CHAIN_ID_AVAX:
      return "Avalanche";
    case CHAIN_ID_BSC:
      return "BSC";
    default:
      return "";
  }
};

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

export const CORE_BRIDGE_ADDRESS_SOLANA =
  "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";

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

export const TOKEN_BRIDGE_ADDRESS_SOLANA =
  "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";

// gas
export const APPROVAL_GAS_LIMIT = "100000";

export const SOLANA_HOST = clusterApiUrl("devnet");
