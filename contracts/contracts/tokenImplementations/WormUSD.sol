// SPDX-License-Identifier: Apache 2

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WormUSD is ERC20 {
    constructor(address mintToAddress) ERC20("wormUSD", "WUSD"){
        _mint(mintToAddress, 1000000000*10**18);
    }
}