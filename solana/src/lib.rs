#![deny(unused_must_use)]

// A common serialization library used in the blockchain space, which we'll use to serialize our
// cross chain message payloads.
use borsh::{
    BorshDeserialize,
    BorshSerialize,
};

// Solana SDK imports to interact with the solana runtime.
use solana_program::account_info::{
    next_account_info,
    AccountInfo,
};
use solana_program::entrypoint::ProgramResult;
//use solana_program::program::invoke_signed;       // For non-SDK calls
use solana_program::pubkey::Pubkey;
use solana_program::{
    entrypoint,
};

#[cfg(feature = "wasm")]
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
extern crate wasm_bindgen;

#[cfg(feature = "wasm")]
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
pub mod wasm;

pub mod instruction;

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub enum Instruction {
    /// CompleteTransferAndSwap
    /// 0: Payer           [Signer]
    /// 1: Worm Config     [Worm PDA]
    /// 2: VAA             [Worm PDA]
    /// 3: Claim           [Token Bridge PDA]
    /// 4: Chain           [Token Bridge PDA] Derived from chainId, 32bytes data.
    /// 5: To              [this program's ATA]
    /// 6: To Owner        [this program]
    /// 7: To Fees         [relayer's ATA]
    /// 8: Mint            [SPL PDA]
    /// 9: Wrapped Meta    [Metaplex PDA]
    /// 10: Mint Authority [this program's PDA]
    /// 11: Rent           [Program]   -- Needed for claim account.
    /// 12: System         [Program]   -- Needed for invoke_signed.
    /// 13: Wormhole       [Program]   -- Needed for invoke_signed.
    /// 14: SPL            [Program]   -- Needed for invoke_signed.
    /// 15: Token Bridge   [Program]   -- Needed for invoke_signed.
    CompleteTransferAndSwap,
}


entrypoint!(process_instruction);

/// The Solana entrypoint, here we deserialize our Borsh encoded Instruction and dispatch to our
/// program handlers.
pub fn process_instruction(id: &Pubkey, accs: &[AccountInfo], data: &[u8]) -> ProgramResult {
    match BorshDeserialize::try_from_slice(data).unwrap() {
        Instruction::CompleteTransferAndSwap => complete_transfer_and_swap(id, accs),
    }?;
    Ok(())
}


/// Sends a message from this chain to wormhole.
fn complete_transfer_and_swap(_id: &Pubkey, accs: &[AccountInfo]) -> ProgramResult {
    let accounts = &mut accs.iter();
    // Read remaining unreferenced accounts.
    let _payer = next_account_info(accounts)?;
    let _config = next_account_info(accounts)?;
    let _vaa = next_account_info(accounts)?;
    let _claim = next_account_info(accounts)?;
    let _chain = next_account_info(accounts)?;
    let _to = next_account_info(accounts)?;
    let _to_owner = next_account_info(accounts)?; //TODO: shouldn't need to specify this in accounts, as it should match program_id
    let _to_fees = next_account_info(accounts)?;
    let _mint = next_account_info(accounts)?;
    let _wrapped_meta = next_account_info(accounts)?;
    let _mint_authority = next_account_info(accounts)?;
    let _rent = next_account_info(accounts)?;
    let _system = next_account_info(accounts)?;
    let _wormhole = next_account_info(accounts)?;
    let _spl = next_account_info(accounts)?;
    let _token_bridge = next_account_info(accounts)?;
    
    Ok(())
}
