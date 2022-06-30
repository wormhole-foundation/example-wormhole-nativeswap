use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ContractState {
    pub wormhole_pubkey: Pubkey,
    pub token_bridge_pubkey: Pubkey,
}

impl ContractState {
    pub const MAXIMUM_SIZE: usize = 32 + 32;

}