use borsh::BorshSerialize;
use solana_program::instruction::{
    AccountMeta,
    Instruction
};
use solana_program::pubkey::Pubkey;
use wormhole_sdk::{
    PostVAAData
};
use crate::api::{
    CompleteTransferData,
    CompleteNoSwapData
};
use token_bridge::{
    accounts::*,
    api::{
        complete_transfer::{
            CompleteWrappedData,
        },
    },
    instructions::{
        complete_wrapped_with_payload
    },
    messages::{
        PayloadTransferWithPayload,
    }
};
use solitaire::{
    processors::seeded::Seeded,
    *,
};
use std::convert::TryInto;

use bridge::{
    Claim,
    ClaimDerivationData
};
/// Create a CompleteTransferAndSwap instruction.
// TODO: fixme
pub fn complete_transfer(
    program_id: Pubkey,
    token_bridge_id: Pubkey,
    bridge_id: Pubkey,
    payer: Pubkey,
    message_key: Pubkey,
    vaa: PostVAAData,
    payload: PayloadTransferWithPayload,
    fee_recipient: Option<Pubkey>,
    data: CompleteTransferData,
) -> Instruction {
    let mint_key = WrappedMint::<'_, { AccountState::Uninitialized }>::key(
        &WrappedDerivationData {
            token_chain: payload.token_chain,
            token_address: payload.token_address,
        },
        &token_bridge_id,
    );
    let custody_key = CustodyAccount::<'_, { AccountState::Uninitialized }>::key(
        &CustodyAccountDerivationData { mint: mint_key },
        &program_id,
    );
    let custody_signer_key = CustodySigner::key(None, &program_id);
    // Piggyback of the CompleteWrappedWithPayload instruction which we plan to call internally
    let mut ix = complete_wrapped_with_payload(
        token_bridge_id,
        bridge_id,
        payer,
        message_key,
        vaa,
        payload.clone(),
        custody_key,
        custody_signer_key,
        fee_recipient,
        CompleteWrappedData {},
    ).unwrap();
    // Expects the program to be signer, but the program will sign internally
    ix.accounts[6].is_signer = false;
    // Our transaction additionally needs the Token Bridge address, insert before dependencies
    ix.accounts.insert(11,AccountMeta::new_readonly(token_bridge_id, false));
    Instruction {
        program_id,
        accounts: ix.accounts,
        data: (crate::instruction::Instruction::CompleteTransfer, data).try_to_vec().unwrap(),
    }
}


pub fn complete_no_swap(
    program_id: Pubkey,
    token_bridge_id: Pubkey,
    bridge_id: Pubkey,
    payer: Pubkey,
    message_key: Pubkey,
    vaa: PostVAAData,
    payload: PayloadTransferWithPayload,
    fee_recipient: Option<Pubkey>,
    data: CompleteNoSwapData,
) -> Instruction {
    let mint_key = WrappedMint::<'_, { AccountState::Uninitialized }>::key(
        &WrappedDerivationData {
            token_chain: payload.token_chain,
            token_address: payload.token_address,
        },
        &token_bridge_id,
    );
    let custody_key = CustodyAccount::<'_, { AccountState::Uninitialized }>::key(
        &CustodyAccountDerivationData { mint: mint_key },
        &program_id,
    );
    let custody_signer_key = CustodySigner::key(None, &program_id);
    // native swap claim account
    let claim_key = Claim::<'_, { AccountState::Uninitialized }>::key(
        &ClaimDerivationData {
            emitter_address: vaa.emitter_address,
            emitter_chain: vaa.emitter_chain,
            sequence: vaa.sequence,
        },
        &program_id,
    );

    let to_key = Pubkey::new_from_array(payload.payload[32..64].try_into().expect("blah blah"));

    
    // Piggyback of the CompleteWrappedWithPayload instruction which we plan to call internally
    let mut ix = complete_wrapped_with_payload(
        token_bridge_id,
        bridge_id,
        payer,
        message_key,
        vaa,
        payload.clone(),
        custody_key,
        custody_signer_key,
        if let Some(fee_r) = fee_recipient {
            Some(fee_r)
        } else {
            Some(to_key)
        },
        CompleteWrappedData {},
    ).unwrap();

    // Token bridge claim is not writable 
    ix.accounts[3].is_writable = false;
    // Expects the program to be signer, but the program will sign internally
    ix.accounts[6].is_signer = false;
    // Needs to be the account of the PDA of native swap
    ix.accounts.insert(4,AccountMeta::new(claim_key, false));
    // Our transaction additionally needs the Token Bridge address, insert before dependencies
    ix.accounts.insert(12,AccountMeta::new_readonly(token_bridge_id, false));
    ix.accounts.insert(13,AccountMeta::new(to_key, false));

    //ix.accounts[7].is_writable = true;

    Instruction {
        program_id,
        accounts: ix.accounts,
        data: (crate::instruction::Instruction::CompleteNoSwap, data).try_to_vec().unwrap(),
    }
}
