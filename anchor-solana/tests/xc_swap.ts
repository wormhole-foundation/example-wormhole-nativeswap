import * as anchor from "@project-serum/anchor";
//import { BN, Program, web3 } from "@project-serum/anchor";
import { web3, Program, BN } from "@project-serum/anchor";
import { XcSwap } from "../target/types/xc_swap";
import { expect } from "chai";

//import { web3 } from "@project-serum/anchor";
//import { TransactionSignature } from "@solana/web3.js";

import { readFileSync } from "fs";

import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  //  Account as AssociatedTokenAccount,
  getMint,
  createMint,
  Account,
  TOKEN_PROGRAM_ID,
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

  let mint = null; // PublicKey
  let mintATA: Account = null;

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
    await connection.confirmTransaction(tx, "confirmed");
    //console.log("Your transaction was confirmed");

    const authoritySignerKey = deriveAddress([Buffer.from("authority_signer")], TOKEN_BRIDGE_ADDRESS);
    const contract_state_account = await program.account.contractState.fetch(contract_state_addr, "processed");
    console.log("contract_state_account: ", contract_state_account.authoritySignerKey.toString());
    expect(authoritySignerKey.equals(contract_state_account.authoritySignerKey));
  });

  //------------------------------------------------------------------
  it("create and mint some native token", async () => {
    // const rbh1 = await connection.getLatestBlockhash("finalized");
    //    console.log("rbh1: ", rbh1);

    //    const contract_state = deriveAddress([Buffer.from("contract_state")], program.programId);
    mint = await createMint(connection, payer, payer.publicKey, payer.publicKey, 9, undefined, {
      commitment: "confirmed",
    });
    mintATA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, "confirmed", {
      commitment: "confirmed",
    });

    //    const bh2 = await connection.getBlockHeight("confirmed");
    //    const rbh2 = await connection.getLatestBlockhash("confirmed");
    //    const rbh1_valid = await connection.isBlockhashValid();
    //    console.log("rbh2: ", rbh2, " / ", bh2);

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
    // console.log(
    //   "new mint addr: ",
    //   mint.toString(),
    //   " , ATA: ",
    //   mintATA.address.toString(),
    //   " balance: ",
    //   balance.toString()
    // );
  });

  //------------------------------------------------------------------
  it("Partial verify contract_state account", async () => {
    const authoritySignerKey = deriveAddress([Buffer.from("authority_signer")], TOKEN_BRIDGE_ADDRESS);
    const contract_state_addr = deriveAddress([Buffer.from("contract_state")], program.programId);
    const contract_state_account = await program.account.contractState.fetch(contract_state_addr);
    console.log("contract_state_account: ", contract_state_account.authoritySignerKey.toString());
    expect(authoritySignerKey.equals(contract_state_account.authoritySignerKey));
  });

  //------------------------------------------------------------------
  it("call init_transfer_out_native", async () => {
    console.log("calling init_transfer_out_native");
    console.log("mint: ", mint);
    console.log("TOKEN_BRIDGE_ADDRESS: ", TOKEN_BRIDGE_ADDRESS.toString());

    // Make some rangom keypairs to check in VAA later.
    const tgt_addr_kp = new anchor.web3.Keypair();
    const vaa_kp = new anchor.web3.Keypair();
    // make detectable tgt address
    const tgtAddress = Buffer.alloc(32, "t");
    const ta = new Uint8Array(tgtAddress);

    const tokenBridgeCustody = deriveAddress([mint.toBytes()], TOKEN_BRIDGE_ADDRESS);
    //    console.log("tokenBridgeCustody: ", tokenBridgeCustody.toString());

    const contractStateAddr = deriveAddress([Buffer.from("contract_state")], program.programId);
    const tokenBridgeConfig = deriveAddress([Buffer.from("config")], TOKEN_BRIDGE_ADDRESS);
    const tokenBridgeAuthoritySigner = deriveAddress([Buffer.from("authority_signer")], TOKEN_BRIDGE_ADDRESS);
    const tokenBridgeCustodySigner = deriveAddress([Buffer.from("custody_signer")], TOKEN_BRIDGE_ADDRESS);

    const coreBridgeConfig = deriveAddress([Buffer.from("Bridge")], CORE_BRIDGE_ADDRESS);
    const wormholeEmitter = deriveAddress([Buffer.from("emitter")], TOKEN_BRIDGE_ADDRESS);
    const wormholeSequence = deriveAddress([Buffer.from("Sequence"), wormholeEmitter.toBytes()], CORE_BRIDGE_ADDRESS);
    const wormholeFeeCollector = deriveAddress([Buffer.from("fee_collector")], CORE_BRIDGE_ADDRESS);

    const senderPda = deriveAddress([Buffer.from("sender")], program.programId);

    const tx = await program.methods
      .initTransferOutNative(new BN(55), 2, ta)
      .accounts({
        payer: payer.publicKey,
        contractState: contractStateAddr,
        tokenBridgeConfig: tokenBridgeConfig,
        fromTokenAccount: mintATA.address,
        mint: mint,
        tokenBridgeCustody: tokenBridgeCustody,
        tokenBridgeAuthoritySigner: tokenBridgeAuthoritySigner,
        tokenBridgeCustodySigner: tokenBridgeCustodySigner,
        coreBridgeConfig: coreBridgeConfig,
        coreBridge: CORE_BRIDGE_ADDRESS,
        tokenBridge: TOKEN_BRIDGE_ADDRESS,
        wormholeMessage: vaa_kp.publicKey,
        wormholeEmitter: wormholeEmitter,
        wormholeSequence: wormholeSequence,
        wormholeFeeCollector: wormholeFeeCollector,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        sender: senderPda,
      })
      .signers([payer, vaa_kp])
      //  .rpc({ commitment: "finalized" });    // In case we do need to use this account right away.
      .rpc();
    // use .instruction() instead of .rpc() to print instruction to console.
  });
});
