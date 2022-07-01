use anchor_lang::prelude::*;

mod errors;
mod context;
mod env;
mod wormhole;
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
        ctx.accounts.contract_state.set_wormhole_accounts(&ctx.accounts.wormhole.key(), &ctx.accounts.token_bridge.key());

        Ok(())
    }
}
