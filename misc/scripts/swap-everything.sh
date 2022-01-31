#!/bin/bash

set -euo pipefail

root=$(dirname $0)
script="${root}/swap-with-vaa.js"

echo `which node`

node $script --in ETH --out MATIC
node $script --in ETH --out BNB
node $script --in ETH --out AVAX
node $script --in MATIC --out BNB
node $script --in MATIC --out AVAX
node $script --in BNB --out MATIC

echo "done"