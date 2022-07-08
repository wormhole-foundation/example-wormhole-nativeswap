import * as anchor from "@project-serum/anchor";
//import { BN, Program, web3 } from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { XcSwap } from "../target/types/xc_swap";
import { expect } from "chai";

import { readFileSync } from "fs";

import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  Account as AssociatedTokenAccount,
  getMint,
  createMint,
} from "@solana/spl-token";

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
import { publicKey } from "@project-serum/anchor/dist/cjs/utils";
import { Pubkey } from "@certusone/wormhole-sdk/lib/cjs/solana/core/bridge_bg";

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

  let mint = null;
  let mintATA = null;

  //------------------------------------------------------------------
  it("initialize the contract", async () => {
    // Create and populate contract_state account.
    const contract_state_addr = deriveAddress([Buffer.from("contract_state")], program.programId);

    console.log("Payer: ", payer.publicKey.toString());

    const tx = await program.methods
      .contractInitialize()
      .accounts({
        contractState: contract_state_addr,
        wormhole: CORE_BRIDGE_ADDRESS,
        tokenBridge: TOKEN_BRIDGE_ADDRESS,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      //  .rpc({ commitment: "finalized" });    // In case we do need to use this account right away.
      .rpc();
    console.log("contractInitialize tx signature", tx);

    //await connection.confirmTransaction(tx, "finalized");   // No neeed if rpc() has commitment as arg.
    //await connection.confirmTransaction(tx, "finalized");
    //console.log("Your transaction was confirmed");

    const authoritySignerKey = deriveAddress([Buffer.from("authority_signer")], TOKEN_BRIDGE_ADDRESS);
    const contract_state_account = await program.account.contractState.fetch(contract_state_addr, "processed");
    console.log("contract_state_account: ", contract_state_account.authoritySignerKey.toString());
    expect(authoritySignerKey.equals(contract_state_account.authoritySignerKey));
  });

  //------------------------------------------------------------------
  it("create and mint some native token", async () => {
    const rbh1 = await connection.getLatestBlockhash("finalized");
    console.log("rbh1: ", rbh1);

    //    const contract_state = deriveAddress([Buffer.from("contract_state")], program.programId);
    mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, 9, undefined, {
      commitment: "finalized",
    });
    mintATA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, "confirmed", {
      commitment: "confirmed",
    });

    const bh2 = await connection.getBlockHeight("finalized");
    const rbh2 = await connection.getLatestBlockhash("finalized");
    //    const rbh1_valid = await connection.isBlockhashValid();
    console.log("rbh2: ", rbh2, " / ", bh2);

    // Will deposit to ATA.
    await mintTo(
      connection,
      payer,
      mint,
      mintATA.address,
      payer,
      BigInt("10000000000") // 10 * 10^9 lamports
    );
    // Check the balance
    const balance = await getSplBalance(connection, mint, payer.publicKey);
    expect(balance.toString()).to.equal("10000000000");
    console.log(
      "new mint addr: ",
      mint.toString(),
      " , ATA: ",
      mintATA.address.toString(),
      " balance: ",
      balance.toString()
    );
  });

  //------------------------------------------------------------------
  it("Partial verify contract_state account", async () => {
    const authoritySignerKey = deriveAddress([Buffer.from("authority_signer")], TOKEN_BRIDGE_ADDRESS);
    const contract_state_addr = deriveAddress([Buffer.from("contract_state")], program.programId);
    const contract_state_account = await program.account.contractState.fetch(contract_state_addr);
    console.log("contract_state_account: ", contract_state_account.authoritySignerKey.toString());
    expect(authoritySignerKey.equals(contract_state_account.authoritySignerKey));
  });
});
