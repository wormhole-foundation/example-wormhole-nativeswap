use anchor_lang::prelude::*;

mod errors;
mod context;
mod env;
mod wormhole;
mod contract_state;
mod swap_helper;

use context::*;

use anchor_lang::solana_program::{
//    borsh::try_from_slice_unchecked,
//    instruction::Instruction,
    program::{
//        invoke,
        invoke_signed,
    },
//    program_option::COption,
//    system_instruction::transfer,
//    sysvar::*,
};

use anchor_spl::*;

use crate:: {
    wormhole:: {
        TransferNativeWithPayloadData,
        transfer_native_with_payload_ix,
    },
    swap_helper:: {
        DecodedVaaParameters,
//        ForeignAddr,
    },
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod xc_swap {
    use super::*;

    pub fn contract_initialize(ctx: Context<ContractInitialize>) -> Result<()> {
        msg!("in contract_initialize ----");

        ctx.accounts.contract_state.seed_bump = ctx.bumps["contract_state"];
        // Create fixed accounts PDAs so we can simply check addresses in subsequent calls.
        ctx.accounts.contract_state.set_wormhole_accounts(&ctx.program_id, &ctx.accounts.wormhole.key(), &ctx.accounts.token_bridge.key());

        Ok(())
    }


    pub fn init_transfer_out_native(ctx: Context<InitTransferOutNative>, amount: u64
       , tgt_chain: u16
       , tgt_address: [u8; 32]
    ) -> Result<()> {
        let accts = ctx.accounts;
        // msg!("init_transfer_out_native amt: {} tgtc: {}, addr: {:?}", amount, tgt_chain, tgt_address);
//        msg!("native token mint: {}", accts.mint.key());
//        msg!("sender bumps: {}",  ctx.bumps["sender"]);


        // We need to delegate authority to the token bridge program's
        // authority signer to spend the custodian's token
        let authority_signer = &accts.token_bridge_authority_signer;
        token::approve(
            CpiContext::new_with_signer(
                accts.token_program.to_account_info(),
                token::Approve {
                    to: accts.from_token_account.to_account_info(),
                    delegate: authority_signer.to_account_info(),
                    authority: accts.payer.to_account_info(),
                },
                &[&[]],
            ),
            amount,
        )?;

        // DBD: Instructions for the receiving end. Put actual data.
        let vaa_params = DecodedVaaParameters { 
            version:0,
            swap_amount: (0,0,0),
            contract_address: [0;32],
            relayer_fee: (0,0,0),
            estimated_amount: (0,0,0),
            recipient_address: [0;32],
            path: [[0;32], [0;32]],
            deadline:  (0,0,0),
            pool_fee: (0,0),
            swap_function_type: 0,
            swap_currency_type: 0,
        };

        let ix = transfer_native_with_payload_ix(
            &accts.payer,
            &accts.token_bridge_config,
            &accts.from_token_account,
            &accts.mint,
            &accts.token_bridge_custody,
            &accts.token_bridge_authority_signer,
            &accts.token_bridge_custody_signer,
            &accts.core_bridge_config,
            &accts.core_bridge,
            &accts.wormhole_message,
            &accts.token_bridge,
            &accts.wormhole_emitter,
            &accts.wormhole_sequence,
            &accts.wormhole_fee_collector,
            &accts.sender,
            TransferNativeWithPayloadData {
                nonce: 12345,
                amount,
                target_address: [1; 32], // tgt_address,
                target_chain: 2, //tgt_chain,
                payload: vaa_params.try_to_vec()?,
                cpi_program_id: Some(crate::ID),
            },
        )?;

        invoke_signed(
            &ix,
            &accts.to_account_infos(),
            &[
                &[b"sender", &[ctx.bumps["sender"]]],
                //&[b"custody", &[ctx.bumps["custody"]]],
                // wormhole_message is a signer.
            ],
        )?;

        Ok(())
    }
}
