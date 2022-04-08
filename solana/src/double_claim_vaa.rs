use bridge::{
    vaa::{
        PayloadMessage,
        DeserializePayload,
    },   
    Claim,
    ClaimDerivationData,
};

use borsh::{
    BorshDeserialize,
    BorshSerialize,
};

use solana_program::pubkey::Pubkey;
use solitaire::{
    processors::seeded::Seeded,
    trace,
    CreationLamports::Exempt,
    ExecutionContext,
    Peel,
    AccountOwner,
    AccountState,
    Data,
    Owned,
    *,
};
use std::{
    ops::Deref,
};

use crate::NativeSwapError::*;

pub type TokenBridgeClaim<'a, const STATE: AccountState> = Data<'a, TokenBridgeClaimData, { STATE }>;

#[derive(Default, Clone, Copy, BorshDeserialize, BorshSerialize)]
pub struct TokenBridgeClaimData {
    pub claimed: bool,
}

impl Owned for TokenBridgeClaimData {
    fn owner(&self) -> AccountOwner {
        use std::str::FromStr;
        AccountOwner::Other(Pubkey::from_str(env!("TOKEN_BRIDGE_ADDRESS")).unwrap())
    }
}

pub struct TokenBridgeClaimDerivationData {
    pub emitter_address: [u8; 32],
    pub emitter_chain: u16,
    pub sequence: u64,
}

impl<'b, const STATE: AccountState> Seeded<&TokenBridgeClaimDerivationData> for TokenBridgeClaim<'b, { STATE }> {
    fn seeds(data: &TokenBridgeClaimDerivationData) -> Vec<Vec<u8>> {
        return vec![
            data.emitter_address.to_vec(),
            data.emitter_chain.to_be_bytes().to_vec(),
            data.sequence.to_be_bytes().to_vec(),
        ];
    }
}

#[derive(FromAccounts)]
pub struct DoubleClaimableVAA<'b, T: DeserializePayload> {
    // Signed message for the transfer
    pub message: PayloadMessage<'b, T>,

    // Claim account to prevent double spending
    pub token_bridge_claim: TokenBridgeClaim<'b, { AccountState::Initialized }>,
    pub native_swap_claim: Mut<Claim<'b, { AccountState::Uninitialized }>>,

}

impl<'b, T: DeserializePayload> Deref for DoubleClaimableVAA<'b, T> {
    type Target = PayloadMessage<'b, T>;
    fn deref(&self) -> &Self::Target {
        &self.message
    }
}

impl<'b, T: DeserializePayload> DoubleClaimableVAA<'b, T> {
    pub fn verify(&self, token_bridge_id: &Pubkey, program_id: &Pubkey) -> Result<()> {
        trace!("Seq: {}", self.message.meta().sequence);

        // Verify that the token bridge claim account is derived correctly
        self.token_bridge_claim.verify_derivation(
            token_bridge_id,
            &TokenBridgeClaimDerivationData {
                emitter_address: self.message.meta().emitter_address,
                emitter_chain: self.message.meta().emitter_chain,
                sequence: self.message.meta().sequence,
            },
        )?;

        // Verify that the native swap claim account is derived correctly
        self.native_swap_claim.verify_derivation(
            program_id,
            &ClaimDerivationData {
                emitter_address: self.message.meta().emitter_address,
                emitter_chain: self.message.meta().emitter_chain,
                sequence: self.message.meta().sequence,
            },
        )?;

        Ok(())
    }
}

impl<'b, T: DeserializePayload> DoubleClaimableVAA<'b, T> {
    pub fn is_token_bridge_claimed(&self) -> bool {
        self.token_bridge_claim.claimed
    }

    pub fn is_native_swap_claimed(&self) -> bool {
        self.native_swap_claim.claimed
    }

    pub fn claim(&mut self, ctx: &ExecutionContext, payer: &Pubkey) -> Result<()> {
        if !self.is_token_bridge_claimed() {
            return Err(TokenBridgeNotClaimed.into());
        }

        if self.is_native_swap_claimed() {
            return Err(VAAAlreadyExecuted.into());
        }

        self.native_swap_claim.create(
            &ClaimDerivationData {
                emitter_address: self.message.meta().emitter_address,
                emitter_chain: self.message.meta().emitter_chain,
                sequence: self.message.meta().sequence,
            },
            ctx,
            payer,
            Exempt,
        )?;

        self.native_swap_claim.claimed = true;

        Ok(())
    }
}