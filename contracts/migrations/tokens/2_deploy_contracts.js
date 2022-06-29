require("dotenv").config({ path: ".env" });

const WormUSD = artifacts.require("WormUSD");

module.exports = async function (deployer, network) {
  const mintAddress = process.env.mintToAddress;
  const tokenDecimals = process.env.decimals;
  const tokenSupply = process.env.supply;

  await deployer.deploy(WormUSD, mintAddress, tokenDecimals, tokenSupply);
};
