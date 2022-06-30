use anchor_lang::prelude::*;

use crate:: {
    errors::*,
};

use std::str::FromStr;

const CORE_BRIDGE_ADDRESS: &str = std::env!("CORE_BRIDGE_ADDRESS");
pub const TOKEN_BRIDGE_ADDRESS: &str = std::env!("TOKEN_BRIDGE_ADDRESS");

pub fn env_wormhole_check() -> Result<Pubkey> {
    let pubkey = Pubkey::from_str(CORE_BRIDGE_ADDRESS)
        .map_err(|_| ContractError::InvalidWormholeAddress)?;
    Ok(pubkey)
}

pub fn env_token_bridge_check() -> Result<Pubkey> {
    let pubkey = Pubkey::from_str(TOKEN_BRIDGE_ADDRESS)
        .map_err(|_| ContractError::InvalidTokenBridgeAddress)?;
    Ok(pubkey)
}
