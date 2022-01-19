const fsp = require("fs/promises");

const CrossChainSwapV3 = artifacts.require("CrossChainSwapV3");
const SwapHelper = artifacts.require("SwapHelper");

const scriptsAddressPath = "../react/src/addresses";

module.exports = async function (deployer, network) {
  const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const feeTokenAddress = "0x36Ed51Afc79619b299b238898E72ce482600568a"; // wUST
  const tokenBridgeAddress = "0xF890982f9310df57d00f659cf4fd87e65adEd8d7";

  await deployer.deploy(SwapHelper);
  await deployer.link(SwapHelper, CrossChainSwapV3);
  await deployer.deploy(
    CrossChainSwapV3,
    routerAddress,
    feeTokenAddress,
    tokenBridgeAddress
  );

  // save the contract address somewhere
  await fsp.mkdir(scriptsAddressPath, { recursive: true });

  await fsp.writeFile(
    `${scriptsAddressPath}/${network}.ts`,
    `export const SWAP_CONTRACT_ADDRESS = '${CrossChainSwapV3.address}';`
  );

  //deployer.link(ConvertLib, MetaCoin);
  //deployer.deploy(MetaCoin);
};
