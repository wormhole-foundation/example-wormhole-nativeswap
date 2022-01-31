import yargs from "yargs";
import { ethers } from "ethers";

import { NodeHttpTransport } from "@improbable-eng/grpc-web-node-http-transport";

import {
  ExactInCrossParameters,
  ExactOutCrossParameters,
  UniswapToUniswapQuoter,
} from "../src/route/cross-quote";
import { UniswapToUniswapExecutor } from "../src/swapper/swapper";
import {
  ETH_TOKEN_INFO,
  MATIC_TOKEN_INFO,
  AVAX_TOKEN_INFO,
  BNB_TOKEN_INFO,
  UST_TOKEN_INFO,
} from "../src/utils/consts";

import { makeProvider } from "./src/provider";

require("dotenv").config({ path: ".env" });

// swap related parameters (configurable in UI)
const SWAP_AMOUNT_IN_MATIC = "0.0069";
const SWAP_AMOUNT_IN_ETH = "0.000907";
const SWAP_AMOUNT_IN_AVAX = "0.0075";
const SWAP_AMOUNT_IN_BNB = "0.0015";
const SWAP_AMOUNT_IN_UST = "3.40";

const SWAP_DEADLINE = "1800";
const SWAP_SLIPPAGE = "0.01";

// token bridge things
const BRIDGE_RELAYER_FEE_UST = "0.25";

interface Arguments {
  in: string;
  out: string;
}

function parseArgs(): Arguments {
  const parsed = yargs(process.argv.slice(2))
    .option("in", {
      string: true,
      description: "Name of inbound token",
      required: true,
    })
    .option("out", {
      string: true,
      description: "Name of outbound token",
      required: true,
    })
    .help("h")
    .alias("h", "help").argv;

  const args: Arguments = {
    in: parsed.in,
    out: parsed.out,
  };

  return args;
}

export function makeEvmWallet(
  provider: ethers.providers.Provider
): ethers.Wallet {
  return new ethers.Wallet(process.env.ETH_PRIVATE_KEY, provider);
}

/*
async function fetchTokenBalance(signer, contract) {
    const decimals = await contract.decimals();
    const balanceBeforeDecimals = (await contract.balanceOf(signer.address)).toString();
    const balance = ethers.utils.formatUnits(balanceBeforeDecimals, decimals);
    return balance;
}
*/

// only exist as placeholder for actual wallet connection
function determineWalletFromToken(tokenAddress: string): ethers.Wallet {
  return makeEvmWallet(makeProvider(tokenAddress));
}

function determineAmountFromToken(tokenAddress: string): string {
  switch (tokenAddress) {
    case ETH_TOKEN_INFO.address: {
      return SWAP_AMOUNT_IN_ETH;
    }
    case MATIC_TOKEN_INFO.address: {
      return SWAP_AMOUNT_IN_MATIC;
    }
    case AVAX_TOKEN_INFO.address: {
      return SWAP_AMOUNT_IN_AVAX;
    }
    case BNB_TOKEN_INFO.address: {
      return SWAP_AMOUNT_IN_BNB;
    }
    case UST_TOKEN_INFO.address: {
      return SWAP_AMOUNT_IN_UST;
    }
    default: {
      throw Error("you suck");
    }
  }
}

function logExactInParameters(
  quoter: UniswapToUniswapQuoter,
  params: ExactInCrossParameters
): void {
  console.info(`amountIn:     ${params.amountIn}`);
  console.info(`minAmountOut: ${params.minAmountOut}`);

  const src = params.src;
  if (src === undefined) {
    console.warn(`  src is undefined (ust?)`);
  } else {
    console.info(`src`);
    console.info(`  protocol:     ${src.protocol}`);
    //console.info(`  amountIn:     ${quoter.srcTokenIn.formatAmount(src.amountIn)}`);
    console.info(
      `  amountIn:     ${quoter.srcRouter.formatAmountIn(
        src.amountIn.toString()
      )}`
    );
    console.info(
      //  `  minAmountOut: ${quoter.srcTokenOut.formatAmount(src.minAmountOut)}`
      `  minAmountOut: ${quoter.srcRouter.formatAmountOut(
        src.minAmountOut.toString()
      )}`
    );
    console.info(`  poolFee:      ${src.poolFee}`);
    console.info(`  deadline:     ${src.deadline.toString()}`);
    console.info(`  path:         ${src.path}`);
  }

  const dst = params.dst;
  console.info(`dst`);
  if (dst === undefined) {
    console.warn(`  dst is undefined (ust?)`);
  } else {
    console.info(`  protocol:     ${dst.protocol}`);
    //console.info(`  amountIn:     ${quoter.dstTokenIn.formatAmount(dst.amountIn)}`);
    console.info(
      `  amountIn:     ${quoter.dstRouter.formatAmountIn(
        dst.amountIn.toString()
      )}`
    );
    console.info(
      //  `  minAmountOut: ${quoter.dstTokenOut.formatAmount(dst.minAmountOut)}`
      `  minAmountOut: ${quoter.dstRouter.formatAmountOut(
        dst.minAmountOut.toString()
      )}`
    );
    console.info(`  poolFee:      ${dst.poolFee}`);
    console.info(`  deadline:     ${dst.deadline.toString()}`);
    console.info(`  path:         ${dst.path}`);

    const relayerFee = params.relayerFee;
    console.info(`relayerFee`);
    console.info(`  tokenAddress: ${relayerFee.tokenAddress}`);
    console.info(
      `  amount:       ${quoter.dstRouter.formatAmountIn(relayerFee.amount)}`
    );
  }

  return;
}

async function swapEverythingExactIn(
  swapper: UniswapToUniswapExecutor,
  tokenInAddress: string,
  tokenOutAddress: string,
  isNative: boolean,
  amountIn: string,
  recipientAddress: string
): Promise<void> {
  const isTerraSrc = tokenInAddress === UST_TOKEN_INFO.address;

  if (isTerraSrc) {
    throw Error("cannot use terra source yet");
  }
  // connect src wallet
  const srcWallet = determineWalletFromToken(tokenInAddress);
  console.info(`sender:    ${await srcWallet.getAddress()}`);
  console.info(`recipient: ${recipientAddress}`);

  // tokens selected, let's initialize
  await swapper.initialize(tokenInAddress, tokenOutAddress, isNative);
  console.info(`quoter initialized`);

  // verify pool address on src and dst
  await swapper
    .computeAndVerifySrcPoolAddress()
    .then((address) => {
      console.info(`srcPool:     ${address}`);
      return address;
    })
    .catch((response) => {
      console.error(
        `failed to find a pool address for src. how to handle in the front-end?`
      );
      process.exit(1);
    });

  await swapper
    .computeAndVerifyDstPoolAddress()
    .then((address) => {
      console.info(`dstPool:     ${address}`);
      return address;
    })
    .catch((response) => {
      console.error(
        `failed to find a pool address for dst. how to handle in the front-end?`
      );
      process.exit(1);
    });

  // set deadline
  swapper.setDeadlines(SWAP_DEADLINE);
  swapper.setSlippage(SWAP_SLIPPAGE);
  swapper.setRelayerFee(BRIDGE_RELAYER_FEE_UST);

  const exactInParameters: ExactInCrossParameters =
    await swapper.computeQuoteExactIn(amountIn);

  console.info("exactInParameters");
  logExactInParameters(swapper.quoter, exactInParameters);

  // do the src swap
  if (isTerraSrc) {
    // do terra method
    throw Error("terra src not implemented yet");
  } else {
    console.info("approveAndSwap");
    const srcSwapReceipt = await swapper.evmApproveAndSwap(
      srcWallet,
      recipientAddress
    );
    console.info(`src transaction: ${srcSwapReceipt.transactionHash}`);
  }

  // do the dst swap after fetching vaa
  // connect dst wallet
  const dstWallet = determineWalletFromToken(tokenOutAddress);

  console.info("fetchVaaAndSwap");
  //const dstSwapReceipt = await swapper.fetchVaaAndSwap(dstWallet);
  //console.info(`dst transaction: ${dstSwapReceipt.transactionHash}`);
  console.warn("jk");

  return;
}

function logExactOutParameters(
  quoter: UniswapToUniswapQuoter,
  params: ExactOutCrossParameters
): void {
  const src = params.src;
  console.info(`src`);
  console.info(`  protocol:     ${src.protocol}`);
  console.info(
    `  amountOut:    ${quoter.srcRouter.formatAmountOut(
      src.amountOut.toString()
    )}`
  );
  console.info(
    `  maxAmountIn:  ${quoter.srcRouter.formatAmountIn(
      src.maxAmountIn.toString()
    )}`
  );
  console.info(`  poolFee:      ${src.poolFee}`);
  console.info(`  deadline:     ${src.deadline.toString()}`);
  console.info(`  path:         ${src.path}`);

  const dst = params.dst;
  console.info(`dst`);
  console.info(`  protocol:     ${dst.protocol}`);
  console.info(
    `  amountOut:    ${quoter.dstRouter.formatAmountOut(
      dst.amountOut.toString()
    )}`
  );
  console.info(
    `  maxAmountIn:  ${quoter.dstRouter.formatAmountIn(
      dst.maxAmountIn.toString()
    )}`
  );
  console.info(`  poolFee:      ${dst.poolFee}`);
  console.info(`  deadline:     ${dst.deadline.toString()}`);
  console.info(`  path:         ${dst.path}`);

  const relayerFee = params.relayerFee;
  console.info(`relayerFee`);
  console.info(`  tokenAddress: ${relayerFee.tokenAddress}`);
  console.info(
    `  amount:       ${quoter.dstRouter.formatAmountIn(
      relayerFee.amount.toString()
    )}`
  );
  return;
}

async function swapEverythingExactOut(
  swapper: UniswapToUniswapExecutor,
  tokenInAddress: string,
  tokenOutAddress: string,
  isNative: boolean,
  amountOut: string,
  recipientAddress: string
): Promise<void> {
  // connect src wallet
  const srcWallet = determineWalletFromToken(tokenInAddress);
  console.info(`wallet pubkey: ${await srcWallet.getAddress()}`);

  // tokens selected, let's initialize
  await swapper.initialize(tokenInAddress, tokenOutAddress, isNative);
  console.info(`quoter initialized`);

  // verify pool address on src and dst
  await swapper
    .computeAndVerifySrcPoolAddress()
    .then((address) => {
      console.info(`srcPool:     ${address}`);
      return address;
    })
    .catch((response) => {
      console.error(
        `failed to find a pool address for src. how to handle in the front-end?`
      );
      process.exit(1);
    });

  await swapper
    .computeAndVerifyDstPoolAddress()
    .then((address) => {
      console.info(`dstPool:     ${address}`);
      return address;
    })
    .catch((response) => {
      console.error(
        `failed to find a pool address for dst. how to handle in the front-end?`
      );
      process.exit(1);
    });

  // set deadline
  swapper.setDeadlines(SWAP_DEADLINE);
  swapper.setSlippage(SWAP_SLIPPAGE);
  swapper.setRelayerFee(BRIDGE_RELAYER_FEE_UST);

  const exactOutParameters: ExactOutCrossParameters =
    await swapper.computeQuoteExactOut(amountOut);

  console.info("exactOutParameters");
  logExactOutParameters(swapper.quoter, exactOutParameters);

  // do the src swap
  console.info("approveAndSwap");
  const srcSwapReceipt = await swapper.evmApproveAndSwap(
    srcWallet,
    recipientAddress
  );
  console.info(`src transaction: ${srcSwapReceipt.transactionHash}`);

  // do the dst swap after fetching vaa
  // connect dst wallet
  const dstWallet = determineWalletFromToken(tokenOutAddress);

  console.info("fetchVaaAndSwap");
  //const dstSwapReceipt = await swapper.fetchVaaAndSwap(dstWallet);
  //console.info(`dst transaction: ${dstSwapReceipt.transactionHash}`);
  console.warn("jk");

  return;
}

function getTokenInfo(name: string) {
  switch (name) {
    case "ETH": {
      return ETH_TOKEN_INFO;
    }
    case "MATIC": {
      return MATIC_TOKEN_INFO;
    }
    case "UST": {
      return UST_TOKEN_INFO;
    }
    case "AVAX": {
      return AVAX_TOKEN_INFO;
    }
    case "BNB": {
      return BNB_TOKEN_INFO;
    }
    default: {
      throw Error("invalid token name");
    }
  }
}

async function main() {
  const args = parseArgs();

  const testExactIn = true;
  const isNative = true;

  const swapper = new UniswapToUniswapExecutor();
  swapper.setTransport(NodeHttpTransport());

  const tokenIn = getTokenInfo(args.in);
  const tokenOut = getTokenInfo(args.out);
  //const tokenOut = UST_TOKEN_INFO;

  const recipientAddress = "0x4e2dfAD7D7d0076b5A0A41223E4Bee390C33251C";
  //const recipientAddress = "terra1vewnsxcy5fqjslyyy409cw8js550esen38n8ey";

  if (testExactIn) {
    console.info(`testing exact in. native=${isNative}`);

    console.info(`${tokenIn.name} -> ${tokenOut.name}`);
    await swapEverythingExactIn(
      swapper,
      tokenIn.address,
      tokenOut.address,
      isNative,
      determineAmountFromToken(tokenIn.address),
      recipientAddress
    );

    if (tokenOut.address === UST_TOKEN_INFO.address) {
      console.warn("not pinging back");
    } else {
      console.info(`${tokenOut.name} -> ${tokenIn.name}`);
      await swapEverythingExactIn(
        swapper,
        tokenOut.address,
        tokenIn.address,
        isNative,
        determineAmountFromToken(tokenOut.address),
        recipientAddress
      );
    }
  } else {
    console.info(`testing exact out. native=${isNative}`);

    console.info(`${tokenIn.name} -> ${tokenOut.name}`);
    await swapEverythingExactOut(
      swapper,
      tokenIn.address,
      tokenOut.address,
      isNative,
      determineAmountFromToken(tokenOut.address),
      recipientAddress
    );

    console.info(`${tokenOut.name} -> ${tokenIn.name}`);
    await swapEverythingExactOut(
      swapper,
      tokenOut.address,
      tokenIn.address,
      isNative,
      determineAmountFromToken(tokenIn.address),
      recipientAddress
    );
  }

  return;
}
main();
