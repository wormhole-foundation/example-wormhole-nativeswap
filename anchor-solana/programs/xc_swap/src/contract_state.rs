use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ContractState {
    pub seed_bump: u8, 
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

    // sender.
    pub sender_key: Pubkey,     // 32
}

impl ContractState {
    pub const MAXIMUM_SIZE: usize = 1 + 32 + 32 + 32*8 + 32;

    pub fn set_wormhole_accounts(& mut self, program_id: &Pubkey, wormhole_pkey: &Pubkey, token_bridge_pkey: &Pubkey) {
        self.wormhole_pubkey = *wormhole_pkey;
        self.token_bridge_pubkey = *token_bridge_pkey;
        (self.custody_signer_key, _) = Pubkey::find_program_address(&[b"custody_signer"], token_bridge_pkey);
        (self.mint_signer_key, _) = Pubkey::find_program_address(&[b"mint_signer"], token_bridge_pkey);
        (self.authority_signer_key, _) = Pubkey::find_program_address(&[b"authority_signer"], token_bridge_pkey);
        (self.bridge_config_key, _) = Pubkey::find_program_address(&[b"config"], token_bridge_pkey);
        (self.wormhole_config_key, _) = Pubkey::find_program_address(&[b"Bridge"], wormhole_pkey);
        (self.fee_collector_key, _) = Pubkey::find_program_address(&[b"fee_collector"], wormhole_pkey);
        (self.wormhole_emitter_key, _) = Pubkey::find_program_address(&[b"emitter"], token_bridge_pkey);
        (self.wormhole_sequence_key, _) = Pubkey::find_program_address(
                &[b"Sequence",  self.wormhole_emitter_key.as_ref()],
                wormhole_pkey
        );
        (self.sender_key, _) = Pubkey::find_program_address(&[b"sender"], program_id);
    }
}
