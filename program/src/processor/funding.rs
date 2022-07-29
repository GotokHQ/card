//! Init pass instruction processing

use crate::{
    collections::{authority, deposit, fee},
    error::CardError,
    instruction::FundingArgs,
    state::{Funding, FLAG_ACCOUNT_SIZE},
    utils::*, find_funding_program_address, PREFIX,
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
pub fn init(program_id: &Pubkey, accounts: &[AccountInfo], args: FundingArgs) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let authority_info = next_account_info(account_info_iter)?;
    let payer_info = next_account_info(account_info_iter)?;
    let funding_info = next_account_info(account_info_iter)?;
    let source_token_info = next_account_info(account_info_iter)?;
    let collection_token_info = next_account_info(account_info_iter)?;
    let collection_fee_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;
    
    assert_signer(user_info)?;
    assert_signer(authority_info)?;
    assert_owned_by(funding_info, program_id)?;

    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;

    let mut funding = Funding::unpack_unchecked(&funding_info.data.borrow())?;
    if funding.is_initialized() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    assert_owned_by(source_token_info, &spl_token::id())?;
    let source_token: Account = assert_initialized(source_token_info)?;
    assert_token_owned_by(&source_token, user_info.key)?;
    if source_token.mint == *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }

    assert_owned_by(collection_token_info, &spl_token::id())?;
    let collection_token: Account = assert_initialized(collection_token_info)?;
    assert_token_owned_by(&collection_token, &deposit::id())?;
    if collection_token.mint == *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }

    assert_owned_by(collection_fee_token_info, &spl_token::id())?;
    let collection_fee_token: Account = assert_initialized(collection_fee_token_info)?;
    assert_token_owned_by(&collection_fee_token, &fee::id())?;
    if collection_fee_token.mint == *mint_info.key {
        return Err(CardError::InvalidMint.into());
    }

    let (funding_key, bump_seed) = find_funding_program_address(program_id, &args.key);
    assert_account_key(
        funding_info,
        &funding_key,
        Some(CardError::InvalidFundingKey),
    )?;

    let funding_signer_seeds = &[
        PREFIX.as_bytes(),
        program_id.as_ref(),
        &funding_key.to_bytes(),
        &[bump_seed],
    ];

    create_new_account_raw(*program_id, funding_info, rent_info, system_account_info, payer_info, FLAG_ACCOUNT_SIZE, funding_signer_seeds)?;
    funding.is_initialized = true;

    let fee = calculate_fee(args.amount, args.fee_bps as u64)?;
    let amount = calculate_amount_less_fee(args.amount, args.fee_bps as u64)?;

    transfer(source_token_info, collection_token_info, user_info, amount)?;
    transfer(source_token_info, collection_fee_token_info, user_info, fee)?;
    Funding::pack(funding, *funding_info.data.borrow_mut())?;
    Ok(())
}
