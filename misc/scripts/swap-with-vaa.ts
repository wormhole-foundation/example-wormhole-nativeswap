import { ethers } from "ethers";

import { NodeHttpTransport } from "@improbable-eng/grpc-web-node-http-transport";

import {
  ExactInCrossParameters,
  ExactOutCrossParameters,
  UniswapToUniswapQuoter,
} from "../src/route/cross-quote";

import { UniswapToUniswapExecutor } from "../src/swapper/swapper";

import { makeProvider } from "./src/provider";

require("dotenv").config({ path: ".env" });

// quote using these
const POLYGON_TOKEN_WMATIC = "0x9c3c9283d3e44854697cd22d3faa240cfb032889";
const ETHEREUM_TOKEN_WETH = "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6";

// swap related parameters (configurable in UI)
const SWAP_AMOUNT_IN_WMATIC = "0.0069";
const SWAP_AMOUNT_IN_WETH = "0.000123";
const SWAP_DEADLINE = "1800";
const SWAP_SLIPPAGE = "0.01";

// token bridge things
const BRIDGE_RELAYER_FEE_UST = "0.25";

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
  if (tokenAddress === ETHEREUM_TOKEN_WETH) {
    return SWAP_AMOUNT_IN_WETH;
  } else if (tokenAddress === POLYGON_TOKEN_WMATIC) {
    return SWAP_AMOUNT_IN_WMATIC;
  } else {
    throw Error("you suck");
  }
}

function logExactInParameters(
  quoter: UniswapToUniswapQuoter,
  params: ExactInCrossParameters
): void {
  const src = params.src;
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

  const dst = params.dst;
  console.info(`dst`);
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
  return;
}

async function swapEverythingExactIn(
  swapper: UniswapToUniswapExecutor,
  tokenInAddress: string,
  tokenOutAddress: string,
  isNative: boolean,
  amountIn: string
): Promise<void> {
  // connect src wallet
  const srcWallet = determineWalletFromToken(tokenInAddress);
  console.info(`wallet pubkey: ${await srcWallet.getAddress()}`);

  // tokens selected, let's initialize
  await swapper.initialize(tokenInAddress, tokenOutAddress, isNative);
  console.info(`quoter initialized`);

  /*
  const tokens = swapper.getTokens();

  // display tokens on front-end?
  console.info(
    `srcTokenIn:  ${tokens.srcIn.getAddress()} (${tokens.srcIn.getDecimals()})`
  );
  console.info(
    `srcTokenOut: ${tokens.srcOut.getAddress()} (${tokens.srcOut.getDecimals()})`
  );
  console.info(
    `dstTokenIn:  ${tokens.dstIn.getAddress()} (${tokens.dstIn.getDecimals()})`
  );
  console.info(
    `dstTokenOut: ${tokens.dstOut.getAddress()} (${tokens.dstOut.getDecimals()})`
  );
  */

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
  console.info("approveAndSwap");
  const srcSwapReceipt = await swapper.evmApproveAndSwap(srcWallet);
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
  amountOut: string
): Promise<void> {
  // connect src wallet
  const srcWallet = determineWalletFromToken(tokenInAddress);
  console.info(`wallet pubkey: ${await srcWallet.getAddress()}`);

  // tokens selected, let's initialize
  await swapper.initialize(tokenInAddress, tokenOutAddress, isNative);
  console.info(`quoter initialized`);

  /*
  const tokens = swapper.getTokens();

  // display tokens on front-end?
  console.info(
    `srcTokenIn:  ${tokens.srcIn.getAddress()} (${tokens.srcIn.getDecimals()})`
  );
  console.info(
    `srcTokenOut: ${tokens.srcOut.getAddress()} (${tokens.srcOut.getDecimals()})`
  );
  console.info(
    `dstTokenIn:  ${tokens.dstIn.getAddress()} (${tokens.dstIn.getDecimals()})`
  );
  console.info(
    `dstTokenOut: ${tokens.dstOut.getAddress()} (${tokens.dstOut.getDecimals()})`
  );
  */

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
  const srcSwapReceipt = await swapper.evmApproveAndSwap(srcWallet);
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

async function main() {
  const testExactIn = true;
  const isNative = true;

  const swapper = new UniswapToUniswapExecutor();
  swapper.setTransport(NodeHttpTransport());

  const tokenInAddress = POLYGON_TOKEN_WMATIC;
  const tokenOutAddress = ETHEREUM_TOKEN_WETH;

  if (testExactIn) {
    console.info(`testing exact in. native=${isNative}`);

    console.info("wmatic -> weth");
    await swapEverythingExactIn(
      swapper,
      tokenInAddress,
      tokenOutAddress,
      isNative,
      determineAmountFromToken(tokenInAddress)
    );

    console.info("weth -> wmatic");
    await swapEverythingExactIn(
      swapper,
      tokenOutAddress,
      tokenInAddress,
      isNative,
      determineAmountFromToken(tokenOutAddress)
    );
  } else {
    console.info(`testing exact out. native=${isNative}`);

    console.info("wmatic -> weth");
    await swapEverythingExactOut(
      swapper,
      tokenInAddress,
      tokenOutAddress,
      isNative,
      determineAmountFromToken(tokenOutAddress)
    );

    console.info("weth -> wmatic");
    await swapEverythingExactOut(
      swapper,
      tokenOutAddress,
      tokenInAddress,
      isNative,
      determineAmountFromToken(tokenInAddress)
    );
  }

  return;
}
main();
