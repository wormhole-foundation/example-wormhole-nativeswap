use borsh::BorshSerialize;
use solana_program::instruction::Instruction;
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
        PayloadTransfer,
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
    payload: PayloadTransfer,
    to: Pubkey,
    to_owner: Pubkey,
    fee_recipient: Option<Pubkey>,
    data: CompleteWrappedData,
) -> Instruction {
    let ix = complete_wrapped_with_payload(
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
    
    Instruction {
        program_id,
        accounts: ix.accounts,
        data: (CompleteTransferAndSwap, data).try_to_vec().unwrap(),
    }
}
