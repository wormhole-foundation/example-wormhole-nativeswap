require("dotenv").config({ path: ".env" });
i;
const WormUSD = artifacts.require("WormUSD");

module.exports = async function (deployer, network) {
  const mintAddress = process.env.mintToAddress;

  await deployer.deploy(WormUSD, mintAddress);
};
