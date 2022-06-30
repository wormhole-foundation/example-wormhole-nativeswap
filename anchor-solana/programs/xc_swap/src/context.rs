use anchor_lang::{
    prelude::*,
    // solana_program::sysvar::{
    //     clock,
    //     rent,
    // },
};

// use anchor_spl::{
//     associated_token::AssociatedToken,
//     token::{Mint, Token, TokenAccount},
// };

use crate:: {
    env::*,
    contract_state::*,
};

// Init constant-derived WH account addresses.
// They are used for faster address check, instead of re-deriving
#[derive(Accounts)]
pub struct ContractInitialize<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"contract_state"], bump,
        space = 8 + ContractState::MAXIMUM_SIZE,
    )]
    pub contract_state: Box<Account<'info, ContractState>>,

    #[account(executable, address = env_wormhole_check()?)]
    /// CHECK: Core Bridge Program
    pub wormhole: AccountInfo<'info>,

    #[account(executable, address = env_token_bridge_check()?)]
    /// CHECK: Token Bridge Program
    pub token_bridge: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,

}
