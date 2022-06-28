import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { XcSwap } from "../target/types/xc_swap";

import {
  deriveAddress,
  getBlockTime,
  getPdaAssociatedTokenAddress,
  getPdaSplBalance,
  getSplBalance,
  hexToPublicKey,
  wait,
} from "./helpers/utils";

describe("xc_swap", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.XcSwap as Program<XcSwap>;
  const connection = program.provider.connection;
  // const buyer = web3.Keypair.fromSecretKey(
  //   Uint8Array.from(JSON.parse(readFileSync("./tests/test_buyer_keypair.json").toString()))
  // );

  // before("Airdrop SOL", async () => {
  //   await connection.requestAirdrop(buyer.publicKey, 8000000000); // 8,000,000,000 lamports

  //   // do we need to wait for the airdrop to hit a wallet?
  //   await wait(5);
  // });

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
