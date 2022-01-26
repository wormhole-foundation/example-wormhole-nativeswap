import { ethers } from "ethers";
import { QUICKSWAP_FACTORY_ADDRESS, WMATIC_TOKEN_INFO } from "../utils/consts";
import { UstLocation } from "./generic";
import { UniswapV2Router } from "./uniswap-v2";

export { PROTOCOL } from "./uniswap-v2";

export class QuickswapRouter extends UniswapV2Router {
  constructor(provider: ethers.providers.Provider) {
    super(provider);
    super.setFactoryAddress(QUICKSWAP_FACTORY_ADDRESS);
  }

  async initialize(ustLocation: UstLocation): Promise<void> {
    await super.initializeTokens(WMATIC_TOKEN_INFO, ustLocation);
    return;
  }
}
