const CrossChainSwapV3 = artifacts.require('CrossChainSwapV3');
const CrossChainSwapV2 = artifacts.require('CrossChainSwapV2');
const BytesDecodingTest = artifacts.require('BytesDecodingTest');

module.exports = function(deployer) {
    // CrossChainSwapV3
    {
      const routerAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
      const feeTokenAddress = '0x36Ed51Afc79619b299b238898E72ce482600568a' // wUST
      const tokenBridgeAddress = '0xF890982f9310df57d00f659cf4fd87e65adEd8d7';
      
      deployer.deploy(CrossChainSwapV3, routerAddress, feeTokenAddress, tokenBridgeAddress);
    }

    // CrossChainSwapV2
    {
      const routerAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'; // quickwap
      const feeTokenAddress = '0xe3a1c77e952b57b5883f6c906fc706fcc7d4392c'; // wUST
      const tokenBridgeAddress = '0x377D55a7928c046E18eEbb61977e714d2a76472a';
      
      deployer.deploy(CrossChainSwapV2, routerAddress, feeTokenAddress, tokenBridgeAddress);
    }

    // BytesDecodingTest
    deployer.deploy(BytesDecodingTest)


  //deployer.link(ConvertLib, MetaCoin);
  //deployer.deploy(MetaCoin);
};
