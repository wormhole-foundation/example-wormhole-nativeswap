#!/bin/bash
set -euo pipefail

npx truffle migrate --config cfg/truffle-config.tokens.js --network goerli --reset
