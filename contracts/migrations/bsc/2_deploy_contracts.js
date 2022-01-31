const fsp = require("fs/promises");

const CrossChainSwapV2 = artifacts.require("CrossChainSwapV2");
const SwapHelper = artifacts.require("SwapHelper");

const scriptsAddressPath = "../react/src/addresses";

module.exports = async function(deployer, network) {
    const routerAddress = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3"; // pancakeswap
    const feeTokenAddress = "0x7b8eae1e85c8b189ee653d3f78733f4f788bb2c1"; // wUST
    const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09"; 
    const wrappedBnbAddress = "0xae13d989dac2f0debff460ac112a837c89baa7cd"; 

    await deployer.deploy(SwapHelper);
    await deployer.link(SwapHelper, CrossChainSwapV2);
    await deployer.deploy(
        CrossChainSwapV2,
        routerAddress, 
        feeTokenAddress, 
        tokenBridgeAddress,
        wrappedBnbAddress
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
