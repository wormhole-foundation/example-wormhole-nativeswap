use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ContractState {
    pub wormhole_pubkey: Pubkey,
    pub token_bridge_pubkey: Pubkey,

    // Wormhole core and token bridge PDA we need to verify.
    pub custody_signer_key: Pubkey,     // 32
    pub mint_signer_key: Pubkey,     // 32
    pub authority_signer_key: Pubkey,     // 32
    pub bridge_config_key: Pubkey,     // 32
    pub wormhole_config_key: Pubkey,     // 32
    pub fee_collector_key: Pubkey,     // 32
    pub wormhole_emitter_key: Pubkey,     // 32
    pub wormhole_sequence_key: Pubkey,     // 32
}

impl ContractState {
    pub const MAXIMUM_SIZE: usize = 32 + 32 + 32*8;
}
