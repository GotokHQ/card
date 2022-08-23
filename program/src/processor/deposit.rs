//! Init pass instruction processing

use crate::{
    collections::{authority, deposit, fee},
    error::CardError,
    instruction::DepositArgs,
    utils::*,
    PREFIX, state::{FLAG_ACCOUNT_SIZE, deposit::Deposit},
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
};

use spl_token::state::Account;

/// Process InitPass instruction
pub fn init(program_id: &Pubkey, accounts: &[AccountInfo], args: DepositArgs) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let authority_info = next_account_info(account_info_iter)?;
    let payer_info = next_account_info(account_info_iter)?;
    let deposit_info = next_account_info(account_info_iter)?;
    let source_token_info = next_account_info(account_info_iter)?;
    let collection_token_info = next_account_info(account_info_iter)?;
    let collection_fee_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;

    assert_signer(user_info)?;
    assert_signer(authority_info)?;

    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;
    if deposit_info.lamports() > 0 && !deposit_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    assert_owned_by(source_token_info, &spl_token::id())?;
    let source_token: Account = assert_initialized(source_token_info)?;
    assert_token_owned_by(&source_token, user_info.key)?;
    if source_token.mint != *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }
    assert_owned_by(collection_token_info, &spl_token::id())?;
    let collection_token: Account = assert_initialized(collection_token_info)?;
    assert_token_owned_by(&collection_token, &deposit::id())?;
    if collection_token.mint != *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }
    assert_owned_by(collection_fee_token_info, &spl_token::id())?;
    let collection_fee_token: Account = assert_initialized(collection_fee_token_info)?;
    assert_token_owned_by(&collection_fee_token, &fee::id())?;
    if collection_fee_token.mint != *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }

    let fee = calculate_fee(args.amount, args.fee_bps as u64)?;

    transfer(false, source_token_info, collection_token_info, user_info, args.amount, &[])?;
    transfer(false, source_token_info, collection_fee_token_info, user_info, fee, &[])?;

    create_new_account_raw(
        program_id,
        deposit_info,
        rent_info,
        payer_info,
        system_account_info,
        FLAG_ACCOUNT_SIZE,
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            args.key.as_ref(),
            &[args.bump],
        ],
    )?;
    let mut funding = Deposit::unpack_unchecked(&deposit_info.data.borrow())?;
    if funding.is_initialized() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    funding.is_initialized = true;
    Deposit::pack(funding, *deposit_info.data.borrow_mut())?;
    Ok(())
}
