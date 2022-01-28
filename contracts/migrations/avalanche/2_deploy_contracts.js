const fsp = require("fs/promises");

const CrossChainSwapV2 = artifacts.require("CrossChainSwapV2");
const SwapHelper = artifacts.require("SwapHelper");

const scriptsAddressPath = "../react/src/addresses";

module.exports = async function(deployer, network) {
    const routerAddress = "0x7e3411b04766089cfaa52db688855356a12f05d1"; // hurricaneswap
    const feeTokenAddress = "0xe09ed38e5cd1014444846f62376ac88c5232cde9"; // wUST
    const tokenBridgeAddress = "0x61E44E506Ca5659E6c0bba9b678586fA2d729756"; 
    const wrappedAvaxAddress = "0x1d308089a2d1ced3f1ce36b1fcaf815b07217be3"; 

    await deployer.deploy(SwapHelper);
    await deployer.link(SwapHelper, CrossChainSwapV2);
    await deployer.deploy(
        CrossChainSwapV2,
        routerAddress, 
        feeTokenAddress, 
        tokenBridgeAddress,
        wrappedAvaxAddress
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
