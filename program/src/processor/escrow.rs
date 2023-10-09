use crate::{
    error::CardError::{
        self, AccountAlreadyClosed, AccountAlreadySettled, AccountNotSettledOrInitialized, AccountNotInitialized
    },
    find_program_authority,
    instruction::InitEscrowArgs,
    state::escrow::{Escrow, EscrowState},
    utils::{
        assert_account_key, assert_initialized, assert_owned_by, assert_signer,
        assert_token_owned_by, cmp_pubkeys, create_new_account_raw, spl_token_close, transfer,
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
    sysvar::{clock::Clock, rent::Rent, Sysvar},
};
use spl_token::state::Account as TokenAccount;

pub struct Processor;

pub fn process_init_escrow(
    accounts: &[AccountInfo],
    args: InitEscrowArgs,
    program_id: &Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;

    let fee_payer_info = next_account_info(account_info_iter)?;
    let escrow_info = next_account_info(account_info_iter)?;
    let vault_owner_info = next_account_info(account_info_iter)?;

    let (vault_owner_key, vault_bump) = find_program_authority(program_id);
    assert_account_key(
        vault_owner_info,
        &vault_owner_key,
        Some(CardError::InvalidVaultOwner),
    )?;

    let vault_token_info = next_account_info(account_info_iter)?;
    let src_token_info = next_account_info(account_info_iter)?;
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
    } else {
        assert_owned_by(vault_token_info, &spl_token::id())?;
        assert_owned_by(src_token_info, &spl_token::id())?;
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
        let _: TokenAccount = assert_initialized(src_token_info)?;
        assert_token_owned_by(&vault_token, &vault_owner_key)?;
    }
    let mut escrow = create_escrow(
        program_id,
        escrow_info,
        fee_payer_info,
        rent_info,
        system_account_info,
        &[
            PREFIX.as_bytes(),
            program_id.as_ref(),
            reference_info.key.as_ref(),
            Escrow::PREFIX.as_bytes(),
            &[args.bump],
        ],
    )?;

    if escrow.state != EscrowState::Uninitialized {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    escrow.state = EscrowState::Initialized;
    escrow.fee = args.fee;
    escrow.src_token = *src_token_info.key;
    escrow.vault_token = *vault_token_info.key;
    escrow.vault_bump = vault_bump;
    escrow.amount = args.amount;
    escrow.mint = *mint_info.key;
    escrow.settled_at = None;
    escrow.authority = *authority_info.key;

    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

fn create_escrow<'a>(
    program_id: &Pubkey,
    escrow_info: &AccountInfo<'a>,
    payer_info: &AccountInfo<'a>,
    rent_sysvar_info: &AccountInfo<'a>,
    system_program_info: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
) -> Result<Escrow, ProgramError> {
    if escrow_info.lamports() > 0 && !escrow_info.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    // set up escrow account
    let unpack = Escrow::unpack(&escrow_info.data.borrow_mut());
    let proving_process = match unpack {
        Ok(data) => Ok(data),
        Err(_) => {
            create_new_account_raw(
                program_id,
                escrow_info,
                rent_sysvar_info,
                payer_info,
                system_program_info,
                Escrow::LEN,
                signer_seeds,
            )?;
            msg!("New escrow account was created");
            Ok(Escrow::unpack_unchecked(&escrow_info.data.borrow_mut())?)
        }
    };

    proving_process
}

//inside: impl Processor {}
pub fn process_settlement(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    msg!("Process settlement");
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;

    assert_signer(authority_info)?;

    let dst_token_info = next_account_info(account_info_iter)?;
    let fee_token_info = next_account_info(account_info_iter)?;

    let vault_token_info = next_account_info(account_info_iter)?;
    assert_owned_by(dst_token_info, &spl_token::id())?;
    assert_owned_by(fee_token_info, &spl_token::id())?;

    assert_owned_by(vault_token_info, &spl_token::id())?;

    let escrow_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;
    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;

    assert_account_key(
        authority_info,
        &escrow.authority,
        Some(CardError::InvalidAuthorityId),
    )?;

    if !escrow.is_initialized() {
        if escrow.is_settled() {
            return Err(AccountAlreadySettled.into());
        }
        if escrow.is_closed() {
            return Err(AccountAlreadyClosed.into());
        }
        return Err(AccountNotInitialized.into())
    }
    
    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CardError::InvalidVaultTokenOwner),
    )?;
    let mint_info = next_account_info(account_info_iter)?;
    assert_account_key(mint_info, &escrow.mint, Some(CardError::InvalidMint))?;
    let vault_owner_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;
    let clock = &Clock::from_account_info(clock_info)?;
    let token_program_info = next_account_info(account_info_iter)?;
    assert_account_key(token_program_info, &spl_token::id(), None)?;

    let vault_signer_seeds = [PREFIX.as_bytes(), program_id.as_ref(), &[escrow.vault_bump]];

    let is_native = cmp_pubkeys(mint_info.key, &spl_token::native_mint::id());

    if !is_native {
        let _: TokenAccount = assert_initialized(dst_token_info)?;
        let _: TokenAccount = assert_initialized(fee_token_info)?;
    }

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
        escrow.fee,
        &[&vault_signer_seeds],
    )?;
    msg!("Mark the escrow account as settled...");
    escrow.state = EscrowState::Settled;
    escrow.settled_at = Some(clock.unix_timestamp as u64);
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}

//inside: impl Processor {}
pub fn process_close(accounts: &[AccountInfo], program_id: &Pubkey) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let authority_info = next_account_info(account_info_iter)?;
    assert_signer(authority_info)?;
    let escrow_info = next_account_info(account_info_iter)?;
    let src_token_info = next_account_info(account_info_iter)?;
    let vault_token_info = next_account_info(account_info_iter)?;
    let vault_owner_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let fee_payer_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;
    assert_owned_by(escrow_info, program_id)?;

    let mut escrow = Escrow::unpack(&escrow_info.data.borrow())?;
    assert_account_key(
        authority_info,
        &escrow.authority,
        Some(CardError::InvalidAuthorityId),
    )?;
    if escrow.is_closed() {
        return Err(AccountAlreadyClosed.into());
    }
    if !(escrow.is_settled() || escrow.is_initialized()) {
        return Err(AccountNotSettledOrInitialized.into());
    }
    assert_account_key(mint_info, &escrow.mint, Some(CardError::InvalidMint))?;
    assert_account_key(
        src_token_info,
        &escrow.src_token,
        Some(CardError::InvalidSrcTokenOwner),
    )?;
    assert_account_key(
        vault_token_info,
        &escrow.vault_token,
        Some(CardError::InvalidSrcTokenOwner),
    )?;
    let is_native = cmp_pubkeys(mint_info.key, &spl_token::native_mint::id());
    let vault_signer_seeds = [PREFIX.as_bytes(), program_id.as_ref(), &[escrow.vault_bump]];
    msg!("Closing the escrow account...");
    if is_native {
        assert_account_key(
            vault_token_info,
            vault_owner_info.key,
            Some(CardError::InvalidVaultOwner),
        )?;
        let rent = &Rent::from_account_info(rent_info)?;
        let required_lamports = rent.minimum_balance(Escrow::LEN);
        if escrow_info.lamports() > required_lamports {
            let amount = escrow_info
                .lamports()
                .checked_sub(required_lamports)
                .ok_or::<ProgramError>(CardError::MathOverflow.into())?;
            if amount > 0 {
                transfer(
                    is_native,
                    vault_token_info,
                    src_token_info,
                    vault_owner_info,
                    amount,
                    &[&vault_signer_seeds],
                )?;
            }
        }
    } else {
        let vault_token: TokenAccount = assert_initialized(vault_token_info)?;
        if vault_token.amount > 0 {
            transfer(
                is_native,
                vault_token_info,
                src_token_info,
                vault_owner_info,
                vault_token.amount,
                &[&vault_signer_seeds],
            )?;
        }
        spl_token_close(
            vault_token_info,
            fee_payer_info,
            vault_owner_info,
            &[&vault_signer_seeds],
        )?;
    }
    msg!("Mark the escrow account as closed...");
    escrow.state = EscrowState::Closed;
    Escrow::pack(escrow, &mut escrow_info.data.borrow_mut())?;
    Ok(())
}
