use anchor_lang::prelude::*;
use borsh::{BorshDeserialize, BorshSerialize};

/// Structures contained in VAA (3) after standard VAA header.

pub type ForeignAddr = [u8; 32];        // Can be expanded to struct with Formatter etc.

pub type Unum256 = (u128, u64, u64);
pub type Unum24 = (u8, u16);
/*
// Parameters needed for exactIn swap type
// These are cross-platform BigEndian values.
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct ExactInParameters {
    pub amount_in: Unum256,
    pub amount_out_minimum: Unum256,
    pub target_amount_out_minimum: Unum256,
    pub target_chain_recipient: ForeignAddr,
    pub deadline: Unum256,       // Timestamp?
    pub pool_fee: Unum24,
}

// Parameters needed for exactOut swap type
// These are cross-platform BigEndian values.
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct ExactOutParameters {
    pub amount_out: Unum256,
    pub amount_in_maximum: Unum256,
    pub target_amount_out: Unum256,
    pub target_chain_recipient: ForeignAddr,
    pub deadline: Unum256,
    pub pool_fee: Unum24,
}
*/
// Parameters parsed from a VAA for executing swaps on the destination chain.
// This is payload in PayloadTransferWithPayload struct, which is payload (3) header.
// Is this DEX-specific?
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct DecodedVaaParameters {
    pub version: u8,
    pub swap_amount: Unum256,
    pub contract_address: ForeignAddr,
    pub relayer_fee: Unum256,
    pub estimated_amount: Unum256,
    pub recipient_address: ForeignAddr,
    pub path: [ForeignAddr; 2],
    pub deadline: Unum256,
    pub pool_fee: Unum24,
    pub swap_function_type: u8,
    pub swap_currency_type: u8,
}

// VAA 3 transfer payload header plus custom trailing payload. From Raydium
#[derive(PartialEq, Eq, Debug, Clone)]
pub struct PayloadTransferWithPayload {
    pub amount: Unum256,                // Amount being transferred (big-endian uint256)
    pub token_address: ForeignAddr,  // Address of the token. Left-zero-padded if shorter than 32 bytes
    pub token_chain: u16,            // Chain ID of the token

    pub to: ForeignAddr,             // Address of the recipient. Left-zero-padded if shorter than 32 bytes
    pub to_chain: u16,               // Chain ID of the recipient
    pub from_address: ForeignAddr,   // Sender of the transaction
    pub payload: Vec<u8>,            // Arbitrary payload
}
