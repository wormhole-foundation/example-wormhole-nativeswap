# How to build solana .so contracts.

in wormhole repo in `wormhole/solana/` run

```
make NETWORK=devnet artifacts
```

or

```
make NETWORK=testnet artifacts
```

Tha t will create `wormhole/solana/artifacts-devnet/` or `*-testnet` dir with \*.so cntracts.

Copy needed .so files to `wormhole-nativeswap-example/anchor-solana/tests`

```
wormhole-nativeswap-example/anchor-solana$ cp ../../wormhole/solana/artifacts-devnet/bridge.so tests/
wormhole-nativeswap-example/anchor-solana$ cp ../../wormhole/solana/artifacts-devnet/token_bridge.so tests/
```
