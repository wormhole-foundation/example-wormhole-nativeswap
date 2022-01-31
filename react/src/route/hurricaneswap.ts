import { ethers } from "ethers";

import { AVAX_TOKEN_INFO } from "../utils/consts";
import { UstLocation } from "./generic";
import { UniswapV2Router } from "./uniswap-v2";

export { PROTOCOL } from "./uniswap-v2";

const HURRICANESWAP_FACTORY_ADDRESS = "";

export class HurricaneswapRouter extends UniswapV2Router {
  constructor(provider: ethers.providers.Provider) {
    super(provider);
    super.setFactoryAddress(HURRICANESWAP_FACTORY_ADDRESS);
  }

  async initialize(ustLocation: UstLocation): Promise<void> {
    await super.initializeTokens(AVAX_TOKEN_INFO, ustLocation);
    return;
  }

  computePoolAddress(): string {
    // cannot find factory address on testnet
    return "0xD8087870E8869e45154189d434DF61C19e77ae30";
  }
}
