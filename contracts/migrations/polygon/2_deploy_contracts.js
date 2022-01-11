const fsp = require("fs/promises");

const CrossChainSwapV2 = artifacts.require("CrossChainSwapV2");
const SwapHelper = artifacts.require("SwapHelper");

const scriptsAddressPath = "../ui/src/addresses";

module.exports = async function (deployer, network) {
  const routerAddress = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"; // quickwap
  const feeTokenAddress = "0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c"; // wUST
  const tokenBridgeAddress = "0x377D55a7928c046E18eEbb61977e714d2a76472a";

  await deployer.deploy(SwapHelper);
  await deployer.link(SwapHelper, CrossChainSwapV2);
  await deployer.deploy(
    CrossChainSwapV2,
    routerAddress,
    feeTokenAddress,
    tokenBridgeAddress
  );

  // save the contract address somewhere
  await fsp.mkdir(scriptsAddressPath, { recursive: true });

  await fsp.writeFile(
    `${scriptsAddressPath}/${network}.ts`,
    `export const SWAP_CONTRACT_ADDRESS = '${CrossChainSwapV2.address}';`
  );

  //deployer.link(ConvertLib, MetaCoin);
  //deployer.deploy(MetaCoin);
};
