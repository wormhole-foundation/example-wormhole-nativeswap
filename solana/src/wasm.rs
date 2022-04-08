use solana_program::pubkey::Pubkey;
use std::str::FromStr;
use crate::api::{
    CompleteTransferData,
    CompleteNoSwapData,
};
use crate::instructions::{
    complete_transfer,
    complete_no_swap,
};

use bridge::{
    accounts::PostedVAADerivationData,
    DeserializePayload,
    instructions::hash_vaa,
    vaa::VAA,
    PostVAAData,
};
use solitaire::{
    processors::seeded::Seeded,
    AccountState,
};
use token_bridge::messages::PayloadTransferWithPayload;

use wasm_bindgen::prelude::*;

/// Create a CompleteTransferAndSwap instruction.
#[wasm_bindgen]
pub fn complete_transfer_ix(
    program_id: String,
    token_bridge_id: String,
    bridge_id: String,
    payer: String,
    vaa: Vec<u8>,
    fee_recipient: Option<String>,
) -> JsValue {
    let program_id = Pubkey::from_str(program_id.as_str()).unwrap();
    let token_bridge_id = Pubkey::from_str(token_bridge_id.as_str()).unwrap();
    let bridge_id = Pubkey::from_str(bridge_id.as_str()).unwrap();
    let payer = Pubkey::from_str(payer.as_str()).unwrap();
    let vaa = VAA::deserialize(vaa.as_slice()).unwrap();
    let payload = PayloadTransferWithPayload::deserialize(&mut vaa.payload.as_slice()).unwrap();
    let message_key = bridge::accounts::PostedVAA::<'_, { AccountState::Uninitialized }>::key(
        &PostedVAADerivationData {
            payload_hash: hash_vaa(&vaa.clone().into()).to_vec(),
        },
        &bridge_id,
    );
    let post_vaa_data = PostVAAData {
        version: vaa.version,
        guardian_set_index: vaa.guardian_set_index,
        timestamp: vaa.timestamp,
        nonce: vaa.nonce,
        emitter_chain: vaa.emitter_chain,
        emitter_address: vaa.emitter_address,
        sequence: vaa.sequence,
        consistency_level: vaa.consistency_level,
        payload: vaa.payload,
    };
    let ix = complete_transfer(
        program_id,
        token_bridge_id,
        bridge_id,
        payer,
        message_key,
        post_vaa_data,
        payload.clone(),
        if let Some(fee_r) = fee_recipient {
            Some(Pubkey::from_str(fee_r.as_str()).unwrap())
        } else {
            None
        },
        CompleteTransferData {},
    );
    return JsValue::from_serde(&ix).unwrap();
}

#[wasm_bindgen]
pub fn complete_no_swap_ix(
    program_id: String,
    token_bridge_id: String,
    bridge_id: String,
    payer: String,
    vaa: Vec<u8>,
    fee_recipient: Option<String>,
) -> JsValue {
    let program_id = Pubkey::from_str(program_id.as_str()).unwrap();
    let token_bridge_id = Pubkey::from_str(token_bridge_id.as_str()).unwrap();
    let bridge_id = Pubkey::from_str(bridge_id.as_str()).unwrap();
    let payer = Pubkey::from_str(payer.as_str()).unwrap();
    let vaa = VAA::deserialize(vaa.as_slice()).unwrap();
    let payload = PayloadTransferWithPayload::deserialize(&mut vaa.payload.as_slice()).unwrap();
    let message_key = bridge::accounts::PostedVAA::<'_, { AccountState::Uninitialized }>::key(
        &PostedVAADerivationData {
            payload_hash: hash_vaa(&vaa.clone().into()).to_vec(),
        },
        &bridge_id,
    );
    let post_vaa_data = PostVAAData {
        version: vaa.version,
        guardian_set_index: vaa.guardian_set_index,
        timestamp: vaa.timestamp,
        nonce: vaa.nonce,
        emitter_chain: vaa.emitter_chain,
        emitter_address: vaa.emitter_address,
        sequence: vaa.sequence,
        consistency_level: vaa.consistency_level,
        payload: vaa.payload,
    };
    let ix = complete_no_swap(
        program_id,
        token_bridge_id,
        bridge_id,
        payer,
        message_key,
        post_vaa_data,
        payload.clone(),
        if let Some(fee_r) = fee_recipient {
            Some(Pubkey::from_str(fee_r.as_str()).unwrap())
        } else {
            None
        },
        CompleteNoSwapData {},
    );
    return JsValue::from_serde(&ix).unwrap();
}
