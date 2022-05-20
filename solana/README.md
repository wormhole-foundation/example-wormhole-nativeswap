Scenario: User from Chain A wants to swap Token A for Token B on Chain B.

Step 1: User transfers Token A to Native Swap through the token bridge
Step 2: Native Swap redeems the transfer from the token bridge and takes custody of the wrapped-Token A
Step 3a: for "NoSwap", Native Swap sends wrapped-Token A to recipient wallet on Chain B.
Step 3b: for "WithSwap", Native Swap swaps wrapped-Token A for Token B and sends Token B to recipient wallet on Chain B

Instruction::CompleteTransfer
Description: redeems wrapped tokens from the token bridge ATA, transfers them to the NativeSwap ATA. 
Extremely similar to CompleteWrappedWithPayload struct in the token bridge sdk except, instead of the user redeeming the transfer, NativeSwap redeems it. 

Instruction::CompleteNoSwap
Description: transfers wrapped tokens from NativeSwap ATA to user's ATA

### Running
Set you id.json to your private key
```
~/.config/solana/id.json
```
Build the cargo
```
EMITTER_ADDRESS=EMITTER_ADDRESS BRIDGE_ADDRESS=BRIDGE_ADDRESS TOKEN_BRIDGE_ADDRESS=TOKEN_BRIDGE_ADDRESS cargo build-bpf
```
Write the program byte code into a buffer address
```
solana program write-buffer target/deploy/wormhole_nativeswap.so -u d
```
Take the buffer address & Deploy the contract 
```
solana program deploy --program-id PROGRAM_ID --buffer BUFFER -u d
>in testnet (solana devnet), PROGRAM_ID=92XVWWdN47dL38HLZ277rdRJh7RUG2ikmiBRoUGrKXif 
```
Compile the wasm bindings
```
EMITTER_ADDRESS="11111111111111111111111111111115" BRIDGE_ADDRESS="3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5" TOKEN_BRIDGE_ADDRESS="DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe" wasm-pack build --target nodejs -d nodejs -- --features wasm
```
Now the wasm node package is ready to use.
```
cd test
MNEMONIC=PRIVATE_KEY node index.js
```
transfer_ix: the transfer instruction to redeem the tokens from the token bridge and transfer them to NativeSwap. you have to submit a tokenTransfer VAA where the recipient is the custody address

no_swap_ix: the transfer instruction to move the tokens from NativeSwap to the recipients wallet.

