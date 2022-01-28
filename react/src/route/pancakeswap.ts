import { ethers } from "ethers";

import { WBNB_TOKEN_INFO } from "../utils/consts";
import { UstLocation } from "./generic";
import { UniswapV2Router } from "./uniswap-v2";

export { PROTOCOL } from "./uniswap-v2";

const PANCAKESWAP_FACTORY_ADDRESS = null;

export class PancakeswapRouter extends UniswapV2Router {
  constructor(provider: ethers.providers.Provider) {
    super(provider);
    super.setFactoryAddress(PANCAKESWAP_FACTORY_ADDRESS);
  }

  async initialize(ustLocation: UstLocation): Promise<void> {
    await super.initializeTokens(WBNB_TOKEN_INFO, ustLocation);
    return;
  }

  computePoolAddress(): string {
    // cannot find factory address on testnet
    return "0x8682096d4A2a2f3cd63147D05e4BAB47634e2AD1";
  }
}
