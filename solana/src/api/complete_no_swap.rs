use token_bridge::{
    accounts::*,
    messages::{
        PayloadTransferWithPayload,
    },
    types::*
};
use solana_program::{
    account_info::AccountInfo,
    pubkey::Pubkey,
};
use solitaire::{
    processors::seeded::{
        Seeded,
    },
    *,
};

use crate::double_claim_vaa::{
    DoubleClaimableVAA,
    };

pub type TokenBridgeConfigAccount<'b, const STATE: AccountState> = Data<'b, Config, { STATE }>;

pub struct TokenBridgeConfigAccountDerivationData {
    pub token_bridge: Pubkey,
}

impl<'b, const STATE: AccountState> Seeded<&TokenBridgeConfigAccountDerivationData>
    for TokenBridgeConfigAccount<'b, { STATE }>
{
    fn seeds(accs: &TokenBridgeConfigAccountDerivationData) -> Vec<Vec<u8>> {
        vec![
            String::from("config").as_bytes().to_vec(),
            accs.token_bridge.to_bytes().to_vec()
        ]
    }
}

pub type TokenBridgeMintSigner<'b> = Info<'b>;

pub struct TokenBridgeMintSignerDerivationData {
    pub token_bridge: Pubkey,
}

impl<'b> Seeded<&TokenBridgeMintSignerDerivationData>
    for TokenBridgeMintSigner<'b>
{
    fn seeds(accs: &TokenBridgeMintSignerDerivationData) -> Vec<Vec<u8>> {
        vec![
            String::from("mint_signer").as_bytes().to_vec(),
            accs.token_bridge.to_bytes().to_vec()
        ]
    }
}

#[derive(FromAccounts)]
pub struct CompleteNoSwap<'b> {
    pub payer: Mut<Signer<AccountInfo<'b>>>,
    pub config: TokenBridgeConfigAccount<'b, { AccountState::Initialized }>,

    // Signed message for the transfer
    pub vaa: DoubleClaimableVAA<'b, PayloadTransferWithPayload>,
    // Above includes claim account

    pub chain_registration: Endpoint<'b, { AccountState::Initialized }>,

    pub custody: Mut<CustodyAccount<'b, { AccountState::MaybeInitialized }>>,
    pub custody_signer: CustodySigner<'b>,
    pub to_fees: Mut<Data<'b, SplAccount, { AccountState::MaybeInitialized }>>,
    pub mint: Mut<WrappedMint<'b, { AccountState::Initialized }>>,
    pub wrapped_meta: WrappedTokenMeta<'b, { AccountState::Initialized }>,

    pub mint_authority: TokenBridgeMintSigner<'b>,
    pub token_bridge: Info<'b>,
}

impl<'a> From<&CompleteNoSwap<'a>> for EndpointDerivationData {
    fn from(accs: &CompleteNoSwap<'a>) -> Self {
        EndpointDerivationData {
            emitter_chain: accs.vaa.meta().emitter_chain,
            emitter_address: accs.vaa.meta().emitter_address,
        }
    }
}

impl<'a> From<&CompleteNoSwap<'a>> for WrappedDerivationData {
    fn from(accs: &CompleteNoSwap<'a>) -> Self {
        WrappedDerivationData {
            token_chain: accs.vaa.token_chain,
            token_address: accs.vaa.token_address,
        }
    }
}

impl<'a> From<&CompleteNoSwap<'a>> for CustodyAccountDerivationData {
    fn from(accs: &CompleteNoSwap<'a>) -> Self {
        CustodyAccountDerivationData {
            mint: *accs.mint.info().key,
        }
    }
}

impl<'b> InstructionContext<'b> for CompleteNoSwap<'b> {
}

#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct CompleteNoSwapData {}

pub fn complete_no_swap(
    ctx: &ExecutionContext,
    accs: &mut CompleteNoSwap,
    _data: CompleteNoSwapData,
) -> Result<()> {

    // Verify that the custody account is derived correctly
    let derivation_data: CustodyAccountDerivationData = (&*accs).into();
    accs.custody
        .verify_derivation(ctx.program_id, &derivation_data)?;
    
    // Prevent vaa double signing

    accs.vaa.verify(accs.token_bridge.info().key, ctx.program_id)?;
    accs.vaa.claim(ctx, accs.payer.key)?;
    //make sure it is a claim for token bridge
    // msg!("Has it been claimed? {:?}", accs.vaa.is_claimed());
    // if !accs.vaa.is_claimed() {
    //     return Err(TokenBridgeNotClaimed.into());
    // }

    //accs.vaa.claim(ctx, accs.payer.key)?;


    Ok(())
}
