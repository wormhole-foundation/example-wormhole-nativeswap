## NativeSwap

This is a non-production example program.

Multi-chain native-to-native token swap using existing DEXes.

### Details

Using liquidity of native vs UST (i.e. the UST highway), one can swap from native A on chain A to native B on chain B. For this specific example, we demonstrate a swap between Polygon (Mumbai testnet) and Ethereum (Goerli testnet) between MATIC and ETH. We wrote example smart contracts to interact with Uniswap V3 and Uniswap V2 forks (QuickSwap in this specific example for Polygon). Any DEX can be used to replace our example as long as the swap for a particular DEX has all of its parameters to perform the swap(s).

A protocol that hosts NativeSwap is expected to run its own relayer to enhance its user experience by only requiring a one-click transaction to perform the complete swap. Otherwise the user will have to perform an extra transaction to manually allow the final swap.

Here is what happens under the hood of this example:

- User generates quote from front-end for native-to-native swap.
- User calls the smart contract with its quote on chain A.
- Smart contract on chain A executes swap from native A to UST. If the swap succeeds, the smart contract will execute a Token Bridge transfer of UST with encoded swap parameters for chain B.
- Guardians sign the Token Bridge transfer.
- The relayer reads the signed VAA and calls the smart contract with the VAA as its only argument.
- Smart contract on chain B completes the UST transfer and decodes the swap parameters from the Wormhole message payload.
- Smart contract on chain B executes swap from UST to native B. If the swap succeeds, the smart contract will send native B to user. Otherwise, it will send UST to user.

The Wormhole message payload for swap parameters are all encoded and decoded on-chain.

We also wrote a front-end UI using a custom class (UniswapToUniswapExecutor) to perform the quotes for "Exact In" (swapping from an exact amount of native A to an estimated amount of native B) and "Exact Out" (swapping from an estimated amount of native A to an exact amount of native B) swaps and execute these swaps based on this quote. This library uses the ABIs of our example smart contracts to execute the swap transactions.

### What's next?

That is up to you! You are not limited to native-to-native multi-chain swaps. Build in your own smart routing with whichever DEX to perform any swap from chain A to chain B. Wormhole messaging and token transfers with payload are generic enough to adapt this example for any of the chains Wormhole currently supports.

### Running

First compile the example contracts:

```
cd contracts
npm ci
./compile_contracts.sh
```

Then copy sample.env to .env, edit .env and replace YOUR-PROJECT-ID with your Infura Goerli and Mumbai Project IDs and also add your Ethereum wallet's private key.
These are needed to deploy the example contracts.

```
cp .env.sample .env
# make sure to edit .env file
```

Then deploy the example contracts:

```
./deploy_to_goerli.sh
./deploy_to_mumbai.sh
```

Then change into the react directory, copy sample.env to .env and replace YOUR-PROJECT-ID with your Infura Goerli and Mumbai Project IDs

```
cd react
cp .env.sample .env
# make sure to edit .env file
```

And finally, start the react app:

```
npm ci
npm run start
```

### Running the swap relayer

You need to have a spy_guardian running in TestNet. If there is not already one running, you can build the docker image and start it as follows:

#### Build the spy_guardian docker container if you don't already have it.

```
$ cd swap_relayer
$ docker build -f Dockerfile.spy_guardian -t spy_guardian .
```

#### Start the spy_guardian docker container in TestNet.

```
$ docker run --platform linux/amd64 --network=host spy_guardian \
--bootstrap /dns4/wormhole-testnet-v2-bootstrap.certus.one/udp/8999/quic/p2p/12D3KooWBY9ty9CXLBXGQzMuqkziLntsVcyz4pk1zWaJRvJn6Mmt \
--network /wormhole/testnet/2/1 \
--spyRPC "[::]:7073"
```

#### Start the swap relayer

```
$ cd swap_relayer
$ cp .env.sample .env
$ # Edit the parameters in .env as appropriate.
$ npm ci
$ npm run build
$ npm run start
```
