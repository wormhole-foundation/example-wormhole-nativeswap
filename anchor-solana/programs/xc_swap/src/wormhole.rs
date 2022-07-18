use anchor_lang::prelude::*;
use borsh::{BorshDeserialize, BorshSerialize};
use anchor_lang::solana_program::{
    system_program,
    sysvar,
    //    borsh::try_from_slice_unchecked,
    instruction::Instruction,
};
    
use crate:: {
    swap_helper::ForeignAddr,
};

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct PostMessageData {
    /// Unique nonce for this message
    pub nonce: u32,

    /// Message payload
    pub payload: Vec<u8>,

    /// Commitment Level required for an attestation to be produced
    pub consistency_level: ConsistencyLevel,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub enum ConsistencyLevel {
    Confirmed,
    Finalized,
}

// Wormhole core bridge commands.
#[derive(AnchorDeserialize, AnchorSerialize)]
pub enum CoreBridgeInstruction {
    Initialize,
    PostMessage,
    PostVAA,
    SetFees,
    TransferFees,
    UpgradeContract,
    UpgradeGuardianSet,
    VerifySignatures,
}

// Wormhole token bridge commands.
#[derive(AnchorDeserialize, AnchorSerialize)]
enum TokenBridgeInstruction {
    Initialize,
    AttestToken,
    CompleteNative,
    CompleteWrapped,
    TransferWrapped,
    TransferNative,
    RegisterChain,
    CreateWrapped,
    UpgradeContract,
    CompleteNativeWithPayload,
    CompleteWrappedWithPayload,
    TransferWrappedWithPayload,
    TransferNativeWithPayload,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct BridgeData {
    /// The current guardian set index, used to decide which signature sets to accept.
    pub guardian_set_index: u32,

    /// Lamports in the collection account
    pub last_lamports: u64,

    /// Bridge configuration, which is set once upon initialization.
    pub config: BridgeConfig,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct BridgeConfig {
    /// Period for how long a guardian set is valid after it has been replaced by a new one.  This
    /// guarantees that VAAs issued by that set can still be submitted for a certain period.  In
    /// this period we still trust the old guardian set.
    pub guardian_set_expiration_time: u32,

    /// Amount of lamports that needs to be paid to the protocol to post a message
    pub fee: u64,
}

#[derive(Debug)]
#[repr(transparent)]
pub struct PostedMessageData(pub MessageData);

/// All VAAs messages posted on solana have this header.
#[derive(Debug, Default, BorshDeserialize, BorshSerialize)]
pub struct MessageData {
    pub vaa_version: u8,                 // Header of the posted VAA
    pub consistency_level: u8,           // Level of consistency requested by the emitter
    pub vaa_time: u32,                   // Time the vaa was submitted
    pub vaa_signature_account: Pubkey,   // Account where signatures are stored
    pub submission_time: u32,            // Time the posted message was created
    pub nonce: u32,                      // Unique nonce for this message
    pub sequence: u64,                   // Sequence number of this message
    pub emitter_chain: u16,              // Emitter of the message
    pub emitter_address: ForeignAddr,       // Emitter of the message
    pub payload: Vec<u8>,                // Message payload
}

impl AnchorDeserialize for PostedMessageData {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        *buf = &buf[3..];
        Ok(PostedMessageData(
            <MessageData as BorshDeserialize>::deserialize(buf)?,
        ))
    }
}

pub fn get_message_data<'info>(vaa_account: &AccountInfo<'info>) -> Result<MessageData> {
    Ok(PostedMessageData::try_from_slice(&vaa_account.data.borrow())?.0)
}


#[derive(AnchorDeserialize, AnchorSerialize, Default)]
pub struct TransferNativeWithPayloadData {
    pub nonce: u32,
    pub amount: u64,
    pub target_address: ForeignAddr,
    pub target_chain: u16,
    pub payload: Vec<u8>,
    pub cpi_program_id: Option<Pubkey>,
}

#[inline(never)]
pub fn transfer_native_with_payload_ix(
    payer: &dyn Key,
    token_bridge_config: &dyn Key,
    from: &dyn Key,
    mint: &dyn Key,
    wh_custody: &dyn Key,
    authority_signer: &dyn Key,
    wh_custody_signer: &dyn Key,
    core_bridge_config: &dyn Key,
    core_bridge: &dyn Key,
    message: &dyn Key,
    token_bridge: &dyn Key,
    emitter: &dyn Key,
    sequence: &dyn Key,
    fee_collector: &dyn Key,
    sender_account: &dyn Key, // PDA(["sender"], crate::ID)
    args: TransferNativeWithPayloadData,
) -> Result<Box<Instruction>> {
    msg!("transfer_native_with_payload_ix");
    let mut data = vec![TokenBridgeInstruction::TransferNativeWithPayload as u8];
    args.serialize(&mut &mut data)?;
    Ok(Box::new(Instruction {
        program_id: token_bridge.key(),
        accounts: vec![
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(token_bridge_config.key(), false),
            AccountMeta::new(from.key(), false),
            AccountMeta::new(mint.key(), false),
            AccountMeta::new(wh_custody.key(), false),
            AccountMeta::new_readonly(authority_signer.key(), false),
            AccountMeta::new_readonly(wh_custody_signer.key(), false),
            AccountMeta::new(core_bridge_config.key(), false),
            AccountMeta::new(message.key(), true),
            AccountMeta::new_readonly(emitter.key(), false),
            AccountMeta::new(sequence.key(), false),
            AccountMeta::new(fee_collector.key(), false),
            AccountMeta::new_readonly(sysvar::clock::id(),false),
            AccountMeta::new_readonly(sender_account.key(), true),
            // Not in tokenBridge TransferNativeWithPayload:
            AccountMeta::new_readonly(sysvar::rent::id(), false),
            AccountMeta::new_readonly(system_program::id(),false),
            AccountMeta::new_readonly(core_bridge.key(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data,
    }))
}
