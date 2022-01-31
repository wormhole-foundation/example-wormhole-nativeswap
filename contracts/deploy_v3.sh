#!/bin/bash
set -euo pipefail

npx truffle migrate --config truffle-config.ethereum.js --network goerli --reset