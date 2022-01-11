#!/bin/bash

set -euo pipefail

npx truffle compile --config truffle-config.ethereum.js
npx truffle compile --config truffle-config.polygon.js

mkdir -p ../ui/src/abi/contracts

cp -r build/contracts/* ../ui/src/abi/contracts
