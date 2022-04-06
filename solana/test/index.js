(async () => {
  const PAYLOAD_3_VAA =
    "01000000000100eaf44116b15bf2a20ef811a359cfca2612a6a79b000dce27b73a116f499e4a5871fa7053c0cbede241fec17ccb4faa36fb96d36c15f85462173795b9749b45a401624de5990000004500040000000000000000000000009dcf9d205c9de35334d646bee44b2d2859712a09000000000000030d0f03000000000000000000000000000000000000000000000000000000000014fb41010000000000000000000000000000000000000000000000000000007575736400030000000000000000000000002c71e7f6206fb8706270f97c046e85f6ef033dcb0002000000000000000000000000000000000000000000000000000000000003d09000000000000000000000000000000000000000000000000000008fd76f4bd6d600000000000000000000000012345756e90eba0c357d6ea5d537a179f9d6d0b036ed51afc79619b299b238898e72ce482600568ab4fbf271143f4fbf7b91a5ded31805e42b2208d600000000000000000000000000000000000000000000000000000000624dec81000bb80101";
  const sdk = require("@certusone/wormhole-sdk");
  const web3s = require("@solana/web3.js");
  const wasm = require("wormhole-nativeswap");
  const { base58 } = require("ethers/lib/utils");
  const spl = require("@solana/spl-token");
  const payer = web3s.Keypair.fromSecretKey(
    base58.decode(process.env.MNEMONIC)
  );
  console.log("PAYER", payer.publicKey.toString());
  const nativeSwapProgram = "EzFrDybhcqtJjdfc8MgqrDuQUGHRUsD94HZbKzVTJitu";
  const ustMintKey = "5Dmmc5CC6ZpKif8iN5DSY9qNYrWJvEKcX2JrxGESqRMu"; // TODO: derive this from VAA
  const associatedAddress = await spl.getAssociatedTokenAddress(
    new web3s.PublicKey(ustMintKey),
    new web3s.PublicKey(nativeSwapProgram)
  );
  console.log("ATA", associatedAddress.toString());
  const ix_json = wasm.complete_transfer_and_swap_ix(
    nativeSwapProgram, // NativeSwap
    "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe", // Token Bridge
    "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5", // Core Bridge
    associatedAddress.toString(), // associated token account of NativeSwap for UST
    payer.publicKey.toString(), // Devnet Wallet
    sdk.hexToUint8Array(PAYLOAD_3_VAA)
  );
  console.log(ix_json);
  console.log(
    ix_json.accounts.map(({ pubkey }) =>
      sdk.hexToNativeString(
        sdk.uint8ArrayToHex(new Uint8Array(pubkey)),
        sdk.CHAIN_ID_SOLANA
      )
    )
  );
  const ix = sdk.ixFromRust(ix_json);

  const connection = new web3s.Connection(
    web3s.clusterApiUrl("devnet"),
    "confirmed"
  );
  const transaction = new web3s.Transaction().add(ix);
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer.publicKey;
  transaction.partialSign(payer);
  //   const signature = await connection.sendRawTransaction(
  //     transaction.serialize()
  //   );
  //   console.log("SIGNATURE", signature);
})();
