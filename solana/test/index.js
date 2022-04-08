(async () => {
  const PAYLOAD_1_VAA =
    "01000000000100339c0d030b927eda9cb7ee53d266cbdc6d8f2a70a2a8031952a3a19ee3963d77030dfa8d70c134ef577f9db119cd606bf82ad593f6bb5addfc57f33e741e7e6201624b367c636d0000000b000000000000000000000000d11de1f930ea1f7dd0290fe3a2e35b9c91aefb37000000000000000c010100000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000337610d27c682e347c9cd60bd4b3b107c9d34ddd000400000000000000000000000012345756e90eba0c357d6ea5d537a179f9d6d0b000040000000000000000000000000000000000000000000000000000000000000000";
  const PAYLOAD_3_VAA =
    "01000000000100eaf44116b15bf2a20ef811a359cfca2612a6a79b000dce27b73a116f499e4a5871fa7053c0cbede241fec17ccb4faa36fb96d36c15f85462173795b9749b45a401624de5990000004500040000000000000000000000009dcf9d205c9de35334d646bee44b2d2859712a09000000000000030d0f03000000000000000000000000000000000000000000000000000000000014fb41010000000000000000000000000000000000000000000000000000007575736400030000000000000000000000002c71e7f6206fb8706270f97c046e85f6ef033dcb0002000000000000000000000000000000000000000000000000000000000003d09000000000000000000000000000000000000000000000000000008fd76f4bd6d600000000000000000000000012345756e90eba0c357d6ea5d537a179f9d6d0b036ed51afc79619b299b238898e72ce482600568ab4fbf271143f4fbf7b91a5ded31805e42b2208d600000000000000000000000000000000000000000000000000000000624dec81000bb80101";
  const PAYLOAD_3_VAA_TO_SOLANA =
    "01000000000100fb0362106fa6d5ba6d57420177ddd419f05734b24533e3f7b7f9363a8d0a0b0173c341520e980dc88a3d271664298ecc2cf3a91807cb28325a96fe95a2277b9001624e48bd0000004500040000000000000000000000009dcf9d205c9de35334d646bee44b2d2859712a0900000000000003120f03000000000000000000000000000000000000000000000000000000000014fa2701000000000000000000000000000000000000000000000000000000757573640003cfd2d35beb9a34356859c056cdeda64589b5477d90d23e4fb228ad9883b70f8e0001000000000000000000000000000000000000000000000000000000000003d0900000000000000000000000000000000000000000000000000000000000000000c9f5e09759e0925c410d87ae6d17ad012e8db04ecd1e1ca452662106179c12170000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000624e4fb20000000101";
  const PAYLOAD_3_VAA_TO_SOLANA_WITH_CUSTODY_SIGNER =
    "010000000001001ba8f2469b35e75c8bd507cb421870fd5ff4f2feb0e2ceee20a4edc7b62bef1e797ad9e61b0cdb4282579966402b15f08c41772c7fcb23036d3b6797abd12556006250558d0000004500040000000000000000000000009dcf9d205c9de35334d646bee44b2d2859712a09000000000000034a0f03000000000000000000000000000000000000000000000000000000000014f90e01000000000000000000000000000000000000000000000000000000757573640003ed7f3bfeb71c78ca3ec9b15c38bb74bae35cc37653b406ed286d988fa440c38f0001000000000000000000000000000000000000000000000000000000000003d0900000000000000000000000000000000000000000000000000000000000000000c9f5e09759e0925c410d87ae6d17ad012e8db04ecd1e1ca452662106179c1217000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000062505c6f0000000101"
  const sdk = require("@certusone/wormhole-sdk");
  sdk.setDefaultWasm("node");
  const web3s = require("@solana/web3.js");
  const wasm = require("wormhole-nativeswap");
  const { base58 } = require("ethers/lib/utils");
  const spl = require("@solana/spl-token");
  const connection = new web3s.Connection(
    web3s.clusterApiUrl("devnet"),
    "confirmed"
  );
  const payer = web3s.Keypair.fromSecretKey(
    base58.decode(process.env.MNEMONIC)
  );
  console.log("PAYER", payer.publicKey.toString());
  const coreBridge = "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
  const tokenBridge = "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
  const nativeSwapProgram = "92XVWWdN47dL38HLZ277rdRJh7RUG2ikmiBRoUGrKXif";
  console.log("Posting VAA...");
  await sdk.postVaaSolanaWithRetry(
    connection,
    async (transaction) => {
      await new Promise(function (resolve) {
        //We delay here so the connection has time to get wrecked
        setTimeout(function () {
          resolve(500);
        });
      });
      transaction.partialSign(payer);
      return transaction;
    },
    coreBridge,
    payer.publicKey.toString(),
    Buffer.from(sdk.hexToUint8Array(PAYLOAD_3_VAA_TO_SOLANA_WITH_CUSTODY_SIGNER)),
    5
  );

  const transfer_ix_json = wasm.complete_transfer_ix(
    nativeSwapProgram,
    tokenBridge,
    coreBridge,
    payer.publicKey.toString(), // Devnet Wallet
    sdk.hexToUint8Array(PAYLOAD_3_VAA_TO_SOLANA_WITH_CUSTODY_SIGNER)
  );
  console.log(transfer_ix_json);
  console.log(
    transfer_ix_json.accounts.map(({ pubkey, is_signer, is_writable }) => [
      sdk.hexToNativeString(
        sdk.uint8ArrayToHex(new Uint8Array(pubkey)),
        sdk.CHAIN_ID_SOLANA
      ),
      is_signer,
      is_writable,
    ])
  );


  const no_swap_ix_json = wasm.complete_no_swap_ix(
    nativeSwapProgram,
    tokenBridge,
    coreBridge,
    payer.publicKey.toString(), // Devnet Wallet
    sdk.hexToUint8Array(PAYLOAD_3_VAA_TO_SOLANA_WITH_CUSTODY_SIGNER)
  );
  console.log(no_swap_ix_json);
  console.log(
    no_swap_ix_json.accounts.map(({ pubkey, is_signer, is_writable }) => [
      sdk.hexToNativeString(
        sdk.uint8ArrayToHex(new Uint8Array(pubkey)),
        sdk.CHAIN_ID_SOLANA
      ),
      is_signer,
      is_writable,
    ])
  );
  

  const transfer_ix = sdk.ixFromRust(transfer_ix_json);
  const no_swap_ix = sdk.ixFromRust(no_swap_ix_json);

  const transaction = new web3s.Transaction().add(no_swap_ix);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer.publicKey;
  transaction.partialSign(payer);
  const signature = await connection.sendRawTransaction(
    transaction.serialize()
  );
  console.log("SIGNATURE", signature);
})();
