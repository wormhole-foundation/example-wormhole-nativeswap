import { ethers } from "ethers";
import { QUICKSWAP_FACTORY_ADDRESS } from "../utils/consts";
import { SingleAmmSwapRouter } from "./uniswap-v2";

export { PROTOCOL } from "./uniswap-v2";

export class QuickswapRouter extends SingleAmmSwapRouter {
  constructor(provider: ethers.providers.Provider) {
    super(provider);
    super.setFactoryAddress(QUICKSWAP_FACTORY_ADDRESS);
  }
}
