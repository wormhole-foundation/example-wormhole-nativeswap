const WormUSD = artifacts.require("WormUSD");

module.exports = async function (deployer, network) {
  const mintAddress = "0x3278E0aE2bc9EC8754b67928e0F5ff8f99CE5934";

  await deployer.deploy(WormUSD, mintAddress);
};
