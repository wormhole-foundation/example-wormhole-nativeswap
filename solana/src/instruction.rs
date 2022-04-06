use borsh::BorshSerialize;
use solana_program::instruction::{
    AccountMeta,
    Instruction
};
use solana_program::pubkey::Pubkey;
use wormhole_sdk::{
    PostVAAData
};
use crate::Instruction::{
    CompleteTransferAndSwap,
};
use token_bridge::{
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
    to: Pubkey,
    to_owner: Pubkey,
    fee_recipient: Option<Pubkey>,
    data: CompleteWrappedData,
) -> Instruction {
    // Piggyback of the CompleteWrappedWithPayload instruction which we plan to call internally
    let mut ix = complete_wrapped_with_payload(
        token_bridge_id,
        bridge_id,
        payer,
        message_key,
        vaa,
        payload.clone(),
        to,
        to_owner,
        fee_recipient,
        CompleteWrappedData {},
    ).unwrap();
    // Expects the program to be signer, but the program will sign internally
    ix.accounts[6].is_signer = false;
    // Our transaction additionally needs the Token Bridge address
    ix.accounts.push(AccountMeta::new_readonly(token_bridge_id, false));
    Instruction {
        program_id,
        accounts: ix.accounts,
        data: (CompleteTransferAndSwap, data).try_to_vec().unwrap(),
    }
}
