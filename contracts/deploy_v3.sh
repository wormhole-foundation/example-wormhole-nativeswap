#!/bin/bash
set -euo pipefail

npx truffle migrate --config cfg/truffle-config.ethereum.js --network goerli --reset
