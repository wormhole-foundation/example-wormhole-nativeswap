import { ethers } from "ethers";

import { ETH_TOKEN_INFO, MATIC_TOKEN_INFO } from "../../src/utils/consts";

export function makeProvider(tokenAddress: string) {
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address: {
      return new ethers.providers.StaticJsonRpcProvider(
        process.env.GOERLI_PROVIDER
      );
    }
    case MATIC_TOKEN_INFO.address: {
      return new ethers.providers.StaticJsonRpcProvider(
        process.env.MUMBAI_PROVIDER
      );
    }
    default: {
      throw Error("unrecognized token address");
    }
  }
}
