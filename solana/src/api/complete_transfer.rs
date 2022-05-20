use bridge::{
    vaa::ClaimableVAA,
};
use token_bridge::{
    accounts::*,
    api::{
        complete_transfer_payload::{
            CompleteWrappedWithPayloadData,
        },
    },
    instruction::Instruction::CompleteWrappedWithPayload,
    messages::{
        PayloadTransferWithPayload,
    },
    types::*
};
use solana_program::{
    account_info::AccountInfo,
    instruction::{
        AccountMeta,
        Instruction,
    },
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
};
use solitaire::{
    processors::seeded::{
        Seeded,
    },
    CreationLamports::Exempt,
    *,
};

// have to create custom config account for the token bridge b/c the default ConfigAccount in solana/modules/token_bridge/program/src/accounts.rs 
// is a derived account and assumes the program id is the ExecutionContext, 
// which is normally the token bridge... but in this case would be NativeSwap.
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

//Info is short alias for AccountInfo from solana programs
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

/*
#[derive(FromAccounts)]
pub struct CompleteWrappedWithPayload<'b> {
    pub payer: Mut<Signer<AccountInfo<'b>>>,
    pub config: ConfigAccount<'b, { AccountState::Initialized }>,

    // Signed message for the transfer
    pub vaa: ClaimableVAA<'b, PayloadTransferWithPayload>,

    pub chain_registration: Endpoint<'b, { AccountState::Initialized }>,

    pub to: Mut<Data<'b, SplAccount, { AccountState::Initialized }>>,
    pub to_owner: MaybeMut<Signer<Info<'b>>>,
    pub to_fees: Mut<Data<'b, SplAccount, { AccountState::Initialized }>>,
    pub mint: Mut<WrappedMint<'b, { AccountState::Initialized }>>,
    pub wrapped_meta: WrappedTokenMeta<'b, { AccountState::Initialized }>,

    pub mint_authority: MintSigner<'b>,
}
*/

#[derive(FromAccounts)]
pub struct CompleteTransfer<'b> {
    pub payer: Mut<Signer<AccountInfo<'b>>>,
    pub config: TokenBridgeConfigAccount<'b, { AccountState::Initialized }>,

    // Signed message for the transfer
    pub vaa: ClaimableVAA<'b, PayloadTransferWithPayload>,
    // Above includes claim account

    pub chain_registration: Endpoint<'b, { AccountState::Initialized }>,
    // custody == Native Swap ATA
    pub custody: Mut<CustodyAccount<'b, { AccountState::MaybeInitialized }>>,
    // custody signer == PDA of Native Swap Program ID
    pub custody_signer: CustodySigner<'b>,
    pub to_fees: Mut<Data<'b, SplAccount, { AccountState::MaybeInitialized }>>,
    pub mint: Mut<WrappedMint<'b, { AccountState::Initialized }>>,
    pub wrapped_meta: WrappedTokenMeta<'b, { AccountState::Initialized }>,

    pub mint_authority: TokenBridgeMintSigner<'b>,
    pub token_bridge: Info<'b>, //<-- added for derived config, endpoint, & wrapped metadata
}

impl<'a> From<&CompleteTransfer<'a>> for EndpointDerivationData {
    fn from(accs: &CompleteTransfer<'a>) -> Self {
        EndpointDerivationData {
            emitter_chain: accs.vaa.meta().emitter_chain,
            emitter_address: accs.vaa.meta().emitter_address,
        }
    }
}

impl<'a> From<&CompleteTransfer<'a>> for WrappedDerivationData {
    fn from(accs: &CompleteTransfer<'a>) -> Self {
        WrappedDerivationData {
            token_chain: accs.vaa.token_chain,
            token_address: accs.vaa.token_address,
        }
    }
}

// have to define implementations for the derived data similar to CompleteWrappedWithPayload

impl<'a> From<&CompleteTransfer<'a>> for CustodyAccountDerivationData {
    fn from(accs: &CompleteTransfer<'a>) -> Self {
        CustodyAccountDerivationData {
            mint: *accs.mint.info().key,
        }
    }
}

impl<'b> InstructionContext<'b> for CompleteTransfer<'b> {
}

#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct CompleteTransferData {}

pub fn complete_transfer(
    ctx: &ExecutionContext,
    accs: &mut CompleteTransfer,
    _data: CompleteTransferData,
) -> Result<()> {

    msg!("program id: {:?}", ctx.program_id);
    msg!("accounts: {:?}", ctx.accounts);
    // core bridge
    let bridge_id = ctx.accounts[14].info().key;
    //where the payload/postedVaa is being stored
    let message_key = ctx.accounts[2].info().key;

    // Verify that the custody account is a ATA of custody owner aka native swap
    let derivation_data: CustodyAccountDerivationData = (&*accs).into();
    accs.custody
        .verify_derivation(ctx.program_id, &derivation_data)?;
    
    // if the ATA of the wrapped token belonging to NativeSwap is not created, create it 
    if !accs.custody.is_initialized() {
        accs.custody
            .create(&(&*accs).into(), ctx, accs.payer.key, Exempt)?;

        let init_ix = spl_token::instruction::initialize_account(
            &spl_token::id(),
            accs.custody.info().key,
            accs.mint.info().key,
            accs.custody_signer.key,
        )?;
        invoke_signed(&init_ix, ctx.accounts, &[])?;
    }

    // see https://github.com/certusone/wormhole/blob/2e24f11fa045ac8460347d9796a4ecdb7931a154/solana/modules/token_bridge/program/src/instructions.rs#L312-L338
    // TODO: maybe there's a better way to rebuild this off our list of accounts which should be nearly compatible
    
    // transfer the wrapped token from the token bridge ATA to the NativeSwap ATA
    let transfer_ix = Instruction {
        program_id: *accs.token_bridge.info().key,
        accounts: vec![
            AccountMeta::new(*accs.payer.info().key, true),
            AccountMeta::new_readonly(*accs.config.info().key, false),
            AccountMeta::new_readonly(*message_key, false),
            AccountMeta::new(*accs.vaa.claim.info().key, false),
            AccountMeta::new_readonly(*accs.chain_registration.info().key, false),
            AccountMeta::new(*accs.custody.info().key, false),
            AccountMeta::new_readonly(*accs.custody_signer.info().key, true),
            AccountMeta::new(*accs.to_fees.info().key, false),
            AccountMeta::new(*accs.mint.info().key, false),
            AccountMeta::new_readonly(*accs.wrapped_meta.info().key, false),
            AccountMeta::new_readonly(*accs.mint_authority.info().key, false),
            // Dependencies
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(solana_program::system_program::id(), false),
            // Program
            AccountMeta::new_readonly(*bridge_id, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: (CompleteWrappedWithPayload, CompleteWrappedWithPayloadData {}).try_to_vec()?,
    };
    
    //invoke_signed(&transfer_ix, ctx.accounts, &[])?;
    invoke_seeded(&transfer_ix, ctx, &accs.custody_signer, None)?;
    Ok(())
}
