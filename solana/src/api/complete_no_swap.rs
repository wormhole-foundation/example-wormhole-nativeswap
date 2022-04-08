use token_bridge::{
    accounts::*,
    messages::{
        PayloadTransferWithPayload,
    },
    types::*
};

use std::convert::TryInto;

use solana_program::{
    account_info::AccountInfo,
    pubkey::Pubkey,
    msg,

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
    pub to: Mut<Data<'b, SplAccount, { AccountState::MaybeInitialized }>>,

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

// pub struct DecodedVaaParameters {
//     // in order of decoding
//     version: u8;
//     swapAmount: [u8; 32];
//     contractAddress: Pubkey;
//     relayerFee: [u8; 32];
//     estimatedAmount: [u8; 32];
//     recipientAddress: Pubkey;
//     path: address[2];
//     uint256 deadline;
//     uint24 poolFee;
//     uint8 swapFunctionType;
//     uint8 swapCurrencyType;
// }

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

    let mut amount = accs.vaa.amount.as_u64();
    let mut fee = accs.vaa.fee.as_u64();
    //msg!("accs.vaa.to:{:?}", &Pubkey::new_from_array(accs.vaa.payload[32..64].try_into().unwrap()));
    //let k : [u8;32] = accs.vaa.payload[32..64].try_into().expect("blah blah");
    //msg!("accs.vaa.to:{:?}", &Pubkey::new_from_array(k));
    if accs.mint.decimals > 8 {
        amount *= 10u64.pow((accs.mint.decimals - 8) as u32);
        fee *= 10u64.pow((accs.mint.decimals - 8) as u32);
    }

    // // Transfer tokens
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        accs.custody.info().key,
        &Pubkey::new_from_array(accs.vaa.payload[32..64].try_into().expect("blah blah")),
        accs.custody_signer.key,
        &[],
        amount.checked_sub(fee).unwrap(),
    )?;
    invoke_seeded(&transfer_ix, ctx, &accs.custody_signer, None)?;

    // Transfer fees
    let transfer_ix = spl_token::instruction::transfer(
        &spl_token::id(),
        accs.custody.info().key,
        accs.to_fees.info().key,
        accs.custody_signer.key,
        &[],
        fee,
    )?;
    invoke_seeded(&transfer_ix, ctx, &accs.custody_signer, None)?;

    Ok(())
}
