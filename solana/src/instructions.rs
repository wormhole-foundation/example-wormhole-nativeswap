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
    CompleteTransferAndSwapData,
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

/// Create a CompleteTransferAndSwap instruction.
// TODO: fixme
pub fn complete_transfer_and_swap(
    program_id: Pubkey,
    token_bridge_id: Pubkey,
    bridge_id: Pubkey,
    payer: Pubkey,
    message_key: Pubkey,
    vaa: PostVAAData,
    payload: PayloadTransferWithPayload,
    fee_recipient: Option<Pubkey>,
    data: CompleteTransferAndSwapData,
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
        data: (crate::instruction::Instruction::CompleteTransferAndSwap, data).try_to_vec().unwrap(),
    }
}
