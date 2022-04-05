use borsh::BorshSerialize;
use solana_program::instruction::{
    AccountMeta,
    Instruction,
};
use solana_program::pubkey::Pubkey;
use solana_program::system_program;
use solana_program::sysvar::{
    clock,
    rent,
};

use wormhole_sdk::{
    id,
    config,
    fee_collector,
    sequence,
};

use crate::Instruction::{
    CompleteTransferAndSwap,
};

use token_bridge::{
    api::{
        complete_transfer::{
            CompleteWrappedData,
        },
    }, instructions::{
        complete_wrapped,
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
        Pubkey::new(&payload.to),
        if let Some(fee_r) = fee_recipient {
            Some(Pubkey::from_str(fee_r.as_str()).unwrap())
        } else {
            None
        },
        CompleteWrappedData {},
    );

    return ix
    
    // Instruction {
    //     program_id,
    //     accounts: vec![
    //         AccountMeta::new(payer, true),
    //         AccountMeta::new_readonly(emitter, false),
    //         AccountMeta::new(vaa, true),
    //         AccountMeta::new(config, false),
    //         AccountMeta::new(fee_collector, false),
    //         AccountMeta::new(sequence, false),
    //         AccountMeta::new_readonly(wormhole, false),
    //         AccountMeta::new_readonly(system_program::id(), false),
    //         AccountMeta::new_readonly(rent::id(), false),
    //         AccountMeta::new_readonly(clock::id(), false),
    //     ],
    //     data: CompleteTransferAndSwap.try_to_vec().unwrap(),
    // }
}
