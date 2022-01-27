#!/bin/bash
set -euo pipefail

npx truffle migrate --config cfg/truffle-config.avalanche.js --network fuji --reset
npx truffle migrate --config cfg/truffle-config.bsc.js --network bsc --reset
npx truffle migrate --config cfg/truffle-config.polygon.js --network mumbai --reset