use anchor_lang::prelude::error_code;

#[error_code]
pub enum ContractError {
    #[msg("InvalidWormholeAddress")]
    InvalidWormholeAddress,

    #[msg("InvalidTokenBridgeAddress")]
    InvalidTokenBridgeAddress,
}