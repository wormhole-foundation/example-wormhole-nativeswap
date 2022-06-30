use anchor_lang::prelude::*;

mod errors;
mod context;
mod env;
mod contract_state;

use context::*;
//use state::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod xc_swap {
    use super::*;

    pub fn contract_initialize(ctx: Context<ContractInitialize>) -> Result<()> {
        // Store wormhole PKs
        ctx.accounts.contract_state.wormhole_pubkey = ctx.accounts.wormhole.key();
        ctx.accounts.contract_state.token_bridge_pubkey = ctx.accounts.token_bridge.key();

        // Create fixed accounts PDAs so we can simply check addresses in subsequent calls.
        (ctx.accounts.contract_state.custody_signer_key, _) = Pubkey::find_program_address(&[b"custody_signer"], &ctx.accounts.token_bridge.key());
        (ctx.accounts.contract_state.mint_signer_key, _) = Pubkey::find_program_address(&[b"mint_signer"], &ctx.accounts.token_bridge.key());
        (ctx.accounts.contract_state.authority_signer_key, _) = Pubkey::find_program_address(&[b"authority_signer"], &ctx.accounts.token_bridge.key());
        (ctx.accounts.contract_state.bridge_config_key, _) = Pubkey::find_program_address(&[b"config"], &ctx.accounts.token_bridge.key());
        (ctx.accounts.contract_state.wormhole_config_key, _) = Pubkey::find_program_address(&[b"Bridge"], &ctx.accounts.wormhole.key());
        (ctx.accounts.contract_state.fee_collector_key, _) = Pubkey::find_program_address(&[b"fee_collector"], &ctx.accounts.wormhole.key());
        (ctx.accounts.contract_state.wormhole_emitter_key, _) = Pubkey::find_program_address(&[b"emitter"], &ctx.accounts.token_bridge.key());
        (ctx.accounts.contract_state.wormhole_sequence_key, _) = Pubkey::find_program_address(
                &[b"Sequence",  ctx.accounts.contract_state.wormhole_emitter_key.as_ref()],
                &ctx.accounts.wormhole.key()
        );

        Ok(())
    }
}
