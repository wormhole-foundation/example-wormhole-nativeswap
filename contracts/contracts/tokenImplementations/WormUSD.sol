// SPDX-License-Identifier: Apache 2

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WormUSD is ERC20 {
    constructor(address mintToAddress, uint8 decimals, uint256 supply) ERC20("wormUSD", "WUSD"){
        _setupDecimals(decimals);
        _mint(mintToAddress, supply*10**decimals);
    }
}