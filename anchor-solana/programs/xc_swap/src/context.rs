use anchor_lang::{
    prelude::*,
    // solana_program::sysvar::{
    //     clock,
    //     rent,
    // },
};

use anchor_spl::{
//    associated_token::AssociatedToken,
    token::{
        Mint,
        // Token,
        TokenAccount,
    },
};

use crate:: {
    env::*,
    contract_state::*,
};

pub const SEED_PREFIX_CONTRACT_STATE: &[u8] = b"contract_state";

// Init constant-derived WH account addresses.
// They are used for faster address check, instead of re-deriving
#[derive(Accounts)]
pub struct ContractInitialize<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [SEED_PREFIX_CONTRACT_STATE], bump,
        space = 8 + ContractState::MAXIMUM_SIZE,
    )]
    pub contract_state: Box<Account<'info, ContractState>>,

    #[account(executable, address = env_wormhole_check()?)]
    /// CHECK: Core Bridge Program for Address to be stored.
    pub wormhole: AccountInfo<'info>,

    #[account(executable, address = env_token_bridge_check()?)]
    /// CHECK: Token Bridge Program for Address to be stored.
    pub token_bridge: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// --> init transfer out native
// Will call TokenBridge with TransferNativeWithPayload
#[derive(Accounts, Clone)]
//#[instruction()]
pub struct InitTransferOutNative<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [SEED_PREFIX_CONTRACT_STATE],
        bump = contract_state.seed_bump,
    )]
    pub contract_state: Box<Account<'info, ContractState>>,

    #[account(
        mut,
        address = contract_state.bridge_config_key,
    )]
    /// CHECK: Token Bridge Config
    pub token_bridge_config: AccountInfo<'info>,

    /// CHECK: 
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,

    /// CHECK: ...
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    // Native token custody account's PDA is derived using token_bridge
    #[account(
        mut,
        seeds = [mint.key().as_ref()], bump,
        seeds::program = contract_state.token_bridge_pubkey,
    )]
    /// CHECK: 
    pub token_bridge_custody: AccountInfo<'info>,
    // TokenAccount in Anchor needs an initialized assount.
    // We are not required to have that.
    // Token bridge will create it as needed. So we only check PDA derivation
    //  pub token_bridge_custody: Account<'info, TokenAccount>,

    #[account(
        address = contract_state.authority_signer_key,
    )]
    /// CHECK: Token Bridge Authority Signer, delegated approval for transfer
    pub token_bridge_authority_signer: AccountInfo<'info>,

    #[account(
        address = contract_state.custody_signer_key,
    )]
    /// CHECK: Only used for bridging assets native to Solana.
    pub token_bridge_custody_signer: AccountInfo<'info>,

    #[account(
        mut,
        address = contract_state.wormhole_config_key,
    )]
    /// CHECK: Wormhole Config
    pub core_bridge_config: AccountInfo<'info>,

    #[account(executable, 
        address = contract_state.wormhole_pubkey,
    )]
    /// CHECK: Wormhole Program
    pub core_bridge: AccountInfo<'info>,

    #[account(executable, 
        address =  contract_state.token_bridge_pubkey,
    )]
    /// CHECK: Token Bridge Program
    pub token_bridge: AccountInfo<'info>,

    /// CHECK: ...
    #[account(mut)]
    pub wormhole_message: Signer<'info>,

    #[account(
        address = contract_state.wormhole_emitter_key,
    )]
    /// CHECK: Wormhole Emitter is the Token Bridge Program
    pub wormhole_emitter: AccountInfo<'info>,

    #[account(
        mut,
        address = contract_state.wormhole_sequence_key,
    )]
    /// CHECK: Wormhole Sequence Number
    pub wormhole_sequence: AccountInfo<'info>,

    #[account(
        mut,
        address = contract_state.fee_collector_key,
    )]
    /// CHECK: Wormhole Fee Collector
    pub wormhole_fee_collector: AccountInfo<'info>,

    pub clock: Sysvar<'info, Clock>,

    /// CHECK: ... token program is not used?
    #[account(executable)]
    pub token_program: AccountInfo<'info>,

    #[account(executable)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: used to populate from_address in TransferWithPayload.
    #[account(
        seeds = [b"sender"],
        bump
    )]
    pub sender: AccountInfo<'info>,

}

// --> init transfer in native

// <-- complete transfer out native
// --> complete transfer in native
