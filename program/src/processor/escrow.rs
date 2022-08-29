use crate::{
    collections::{authority, deposit, fee},
    error::CardError::{
        self, AccountAlreadyCanceled, AccountAlreadySettled, AccountNotSettledOrCanceled,
    },
    find_program_authority,
    instruction::InitEscrowArgs,
    state::escrow::Escrow,
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, calculate_fee, cmp_pubkeys,
        create_new_account_raw, empty_account_balance, transfer,
    },
    PREFIX,
};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
};
use spl_token::state::Account as TokenAccount;

pub struct Processor;

pub fn process_init_escrow(
    accounts: &[AccountInfo],
    args: InitEscrowArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let wallet_info = next_account_info(account_info_iter)?;
    assert_signer(wallet_info)?;

    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;

    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;

    let fee_payer_info = next_account_info(account_info_iter)?;
    let escrow_info = next_account_info(account_info_iter)?;
    let vault_owner_info = next_account_info(account_info_iter)?;

    let (vault_owner_key, _) = find_program_authority(program_id);
    assert_account_key(
        vault_owner_info,
        &vault_owner_key,
        Some(CardError::InvalidVaultOwner),
    )?;

    let vault_token_info = next_account_info(account_info_iter)?;
    let src_token_info = next_account_info(account_info_iter)?;
    let dst_token_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let reference_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    let system_account_info = next_account_info(account_info_iter)?;
    let is_native = cmp_pubkeys(mint_info.key, &spl_token::native_mint::id());

    if is_native {
        assert_account_key(
            vault_token_info,
            vault_owner_info.key,
            Some(CardError::InvalidVaultOwner),
        )?;
        assert_account_key(
            src_token_info,
            wallet_info.key,
            Some(CardError::InvalidSrcTokenOwner),
        )?;
        assert_account_key(
            dst_token_info,
            &deposit::id(),
            Some(CardError::InvalidDepositTokenOwner),
        )?;
        assert_account_key(
            fee_token_info,
            &fee::id(),
            Some(CardError::InvalidFeeTokenOwner),
        )?;
    } else {
        assert_owned_by(vault_token_info, &spl_token::id())?;
        assert_owned_by(src_token_info, &spl_token::id())?;
        assert_owned_by(dst_token_info, &spl_token::id())?;
        assert_owned_by(fee_token_info, &spl_token::id())?;
        let vault_token = TokenAccount::unpack(&vault_token_info.data.borrow())?;
        let src_token: TokenAccount = assert_initialized(src_token_info)?;
        let dst_token: TokenAccount = assert_initialized(dst_token_info)?;
        let fee_token: TokenAccount = assert_initialized(fee_token_info)?;
        assert_token_owned_by(&vault_token, &vault_owner_key)?;
        assert_token_owned_by(&src_token, wallet_info.key)?;
        assert_token_owned_by(&dst_token, &deposit::id())?;
        assert_token_owned_by(&fee_token, &fee::id())?;
    }

    let fee_from_bps = calculate_fee(args.amount, args.fee_bps as u64)?;
    let total_fee = fee_from_bps
        .checked_add(args.fixed_fee)
        .ok_or::<ProgramError>(CardError::MathOverflow.into())?;
    let total = args
        .amount
        .checked_add(total_fee)
        .ok_or::<ProgramError>(CardError::MathOverflow.into())?;

    transfer(
        is_native,
        src_token_info,
        vault_token_info,
        wallet_info,
        total,
        &[],
    )?;

    create_new_account_raw(
        program_id,
        escrow_info,
        rent_info,
        fee_payer_info,
        system_account_info,
        Escrow::LEN,
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            reference_info.key.as_ref(),
            Escrow::PREFIX.as_bytes(),
            &[args.bump],
        ],
    )?;

    let mut escrow = Escrow::unpack_unchecked(&escrow_info.data.borrow())?;
    if escrow.is_initialized() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    escrow.is_initialized = true;
    escrow.is_settled = false;
    escrow.is_canceled = false;
    escrow.fee_bps = args.fee_bps;
    escrow.fixed_fee = args.fixed_fee;
    escrow.src_token = *src_token_info.key;
    escrow.dst_token = *dst_token_info.key;
    escrow.vault_token = *vault_token_info.key;
    escrow.fee_token = *fee_token_info.key;
    escrow.amount = args.amount;
    escrow.mint = *mint_info.key;
    escrow.reference = *reference_info.key;

    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_settlement(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process settlement");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;
    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;

    let dst_token_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;

    let vault_token_info = next_account_info(account_info_iter)?;
    assert_owned_by(vault_token_info, &spl_token::id())?;

    let escrow_info = next_account_info(account_info_iter)?;
    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    if escrow.is_canceled {
        return Err(AccountAlreadyCanceled.into());
    }
    if escrow.is_settled {
        return Err(AccountAlreadySettled.into());
    }

    assert_account_key(
        dst_token_info,
        &escrow.dst_token,
        Some(CardError::InvalidDstTokenOwner),
    )?;
    assert_account_key(
        fee_token_info,
        &escrow.fee_token,
        Some(CardError::InvalidFeeTokenOwner),
    )?;
    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CardError::InvalidVaultTokenOwner),
    )?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &escrow.mint, Some(CardError::InvalidMint))?;
    let vault_owner_info = next_account_info(account_info_iter)?;

    let (vault_owner_key, bump) = find_program_authority(program_id);
    assert_account_key(
        vault_owner_info,
        &vault_owner_key,
        Some(CardError::InvalidVaultOwner),
    )?;

    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(token_program_info, &spl_token::id(), None)?;

    let vault_signer_seeds = [PREFIX.as_bytes(), program_id.as_ref(), &[bump]];

    let is_native = cmp_pubkeys(mint_info.key, &spl_token::native_mint::id());
    let fee_from_bps = calculate_fee(escrow.amount, escrow.fee_bps as u64)?;
    let total_fee = fee_from_bps
        .checked_add(escrow.fixed_fee)
        .ok_or::<ProgramError>(CardError::MathOverflow.into())?;

    transfer(
        is_native,
        vault_token_info,
        dst_token_info,
        vault_owner_info,
        escrow.amount,
        &[&vault_signer_seeds],
    )?;
    transfer(
        is_native,
        vault_token_info,
        fee_token_info,
        vault_owner_info,
        total_fee,
        &[&vault_signer_seeds],
    )?;
    msg!("Mark the escrow account as settled...");
    escrow.is_settled = true;
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_cancel(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process cancelation");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;

    let escrow_info = next_account_info(account_info_iter)?;
    let src_token_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    if escrow.is_canceled {
        return Err(AccountAlreadyCanceled.into());
    }
    if escrow.is_settled {
        return Err(AccountAlreadySettled.into());
    }

    assert_account_key(
        src_token_info,
        &escrow.src_token,
        Some(CardError::InvalidSrcTokenOwner),
    )?;
    // , assert_account_key(authority_info, &escrow.authority)?;
    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CardError::InvalidVaultTokenOwner),
    )?;

    let mint_info = next_account_info(account_info_iter)?;

    assert_account_key(mint_info, &escrow.mint, Some(CardError::InvalidMint))?;
    let vault_owner_info = next_account_info(account_info_iter)?;

    let (vault_owner_key, bump_seed) = find_program_authority(program_id);

    assert_account_key(
        vault_owner_info,
        &vault_owner_key,
        Some(CardError::InvalidVaultTokenOwner),
    )?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(token_program_info, &spl_token::id(), None)?;
    let fee_from_bps = calculate_fee(escrow.amount, escrow.fee_bps as u64)?;
    let total_fee = fee_from_bps
        .checked_add(escrow.fixed_fee)
        .ok_or::<ProgramError>(CardError::MathOverflow.into())?;

    let total = escrow
        .amount
        .checked_add(total_fee)
        .ok_or::<ProgramError>(CardError::MathOverflow.into())?;
    let vault_signer_seeds = [PREFIX.as_bytes(), program_id.as_ref(), &[bump_seed]];
    let is_native = cmp_pubkeys(mint_info.key, &spl_token::native_mint::id());

    transfer(
        is_native,
        vault_token_info,
        src_token_info,
        vault_owner_info,
        total,
        &[&vault_signer_seeds],
    )?;

    msg!("Mark the escrow account as canceled...");
    escrow.is_canceled = true;
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_close(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    assert_account_key(
        authority_info,
        &authority::id(),
        Some(CardError::InvalidAuthorityId),
    )?;
    let escrow_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;

    let escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    if !(escrow.is_settled || escrow.is_canceled) {
        return Err(AccountNotSettledOrCanceled.into());
    }

    let fee_payer_info = next_account_info(account_info_iter)?;
    msg!("Closing the escrow account...");
    empty_account_balance(escrow_info, fee_payer_info)?;
    Ok(())
}
