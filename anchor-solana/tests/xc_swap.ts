import * as anchor from "@project-serum/anchor";
//import { BN, Program, web3 } from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { XcSwap } from "../target/types/xc_swap";

import { readFileSync } from "fs";

import {
  deriveAddress,
  getBlockTime,
  getPdaAssociatedTokenAddress,
  getPdaSplBalance,
  getSplBalance,
  hexToPublicKey,
  wait,
} from "./helpers/utils";

import { CORE_BRIDGE_ADDRESS, TOKEN_BRIDGE_ADDRESS } from "./helpers/consts";

describe("xc_swap", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.XcSwap as Program<XcSwap>;
  const connection = program.provider.connection;

  const payer = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync("./tests/test_payer_keypair.json").toString()))
  );

  // const buyer = web3.Keypair.fromSecretKey(
  //   Uint8Array.from(JSON.parse(readFileSync("./tests/test_buyer_keypair.json").toString()))
  // );

  // before("Airdrop SOL", async () => {
  //   await connection.requestAirdrop(buyer.publicKey, 8000000000); // 8,000,000,000 lamports

  //   // do we need to wait for the airdrop to hit a wallet?
  //   await wait(5);
  // });

  it("initialize the contract", async () => {
    // Create and populate contract_state account.
    const contract_state = deriveAddress([Buffer.from("contract_state")], program.programId);

    console.log("Payer: ", payer.publicKey.toString());

    const tx = await program.methods
      .contractInitialize()
      .accounts({
        contractState: contract_state,
        wormhole: CORE_BRIDGE_ADDRESS,
        tokenBridge: TOKEN_BRIDGE_ADDRESS,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Your transaction signature", tx);
  });
});
