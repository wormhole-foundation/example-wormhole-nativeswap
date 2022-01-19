#!/bin/bash

set -euo pipefail

npx truffle compile --config truffle-config.ethereum.js
npx truffle compile --config truffle-config.polygon.js

CONTRACTS="../react/src/abi/contracts"

mkdir -p $CONTRACTS

cp -r build/contracts/* $CONTRACTS
