//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};

/// Initialize a funding arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a funding params
pub struct DepositArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub key: Pubkey,
    pub bump: u8,
}

/// Initialize a funding arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a funding params
pub struct WithdrawArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub key: Pubkey,
    pub bump: u8,
    pub fixed_fee: u64,
}

/// Initialize a escrow arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a escrow params
pub struct InitEscrowArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub fixed_fee: u64,
    pub bump: u8,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone,)]
pub enum CardInstruction {
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the user initializing the fund
    /// 1. `[signer]` The authority responsible for approving due to some external conditions
    /// 2. `[signer]` The fee payer
    /// 3. `[writable]` The deposit account, it will hold all necessary info about the transaction.
    /// 4. `[writable]` The source token account that will fund the transaction
    /// 5. `[writable]` The collection token account that will receive the amount
    /// 6. `[writable]` The collection fee token account that will receive the fee if the transaction is successful
    /// 7. `[]` The token mint
    /// 8. `[]` The rent sysvar
    /// 9. `[]` The token program
    InitDeposit(DepositArgs),

    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the wallet owner
    /// 1. `[signer]` The authority responsible for approving due to some external conditions
    /// 2. `[signer]` The fee payer
    /// 3. `[writable]` The withdraw account, it will hold all necessary info about the transaction.
    /// 4. `[writable]` The source token account that will send the refund
    /// 5. `[writable]` The destination token account that will receive the refund
    /// 6. `[writable]` The source token account that will send the refund
    /// 7. `[]` The token mint
    /// 8. `[]` The rent sysvar
    /// 9. `[]` The token program
    InitWithdrawal(WithdrawArgs),
    /// Starts the trade by creating and populating an escrow account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]`   The account of the wallet owner initializing the escrow
    /// 1. `[signer]`   The escrow authority responsible for approving / refunding payments due to some external conditions
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The escrow account, it will hold all necessary info about the trade.
    /// 4. `[]` The vault owner
    /// 5. `[writable]` The vault token account that holds the token amount
    /// 6. `[]` The src token account that will receive the amount if the transaction is canceled
    /// 7. `[]` The dst token account that will receive the amount if the transaction is successful
    /// 8. `[]` The fee token account that will receive the fee if the transaction is successful
    /// 9. `[]` The token mint
    /// 10. `[]` The reference
    /// 11. `[]` The rent sysvar
    /// 12. `[]` The system program
    /// 13. `[]` The token program
    InitEscrow (InitEscrowArgs),
    /// Settle the payment
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The destination token account for the token they will receive should the trade go through
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[writable]` The escrow account holding the escrow info
    /// 5. `[]` The token mint
    /// 6. `[]` The PDA account
    /// 7. `[]` The token program
    Settle,
    /// Cancel the escrow
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The escrow account holding the escrow info   
    /// 2. `[writable]` The src token account of the payer that initialized the escrow  
    /// 3. `[writable]` The vault token account to get tokens from and eventually close
    /// 4. `[]` The token mint 
    /// 5. `[]` The PDA account
    /// 6. `[]` The token program
    Cancel,
    /// Close the escrow
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The escrow account holding the escrow info     
    /// 2. `[writable]` The fee payer's main account to send their rent fees to
    Close,
}

/// Create `Deposit` instruction
pub fn deposit(
    program_id: &Pubkey,
    user: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    deposit: &Pubkey,
    source_token: &Pubkey,
    collection_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    reference: &Pubkey,
    args: DepositArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*user, true),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*deposit, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*collection_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(*reference, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(*program_id, &CardInstruction::InitDeposit(args), accounts)
}

/// Create `Withdraw` instruction
pub fn withdraw(
    program_id: &Pubkey,
    wallet: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    withdraw: &Pubkey,
    source_token: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    args: WithdrawArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*withdraw, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CardInstruction::InitWithdrawal(args),
        accounts,
    )
}

/// Create `InitEscrow` instruction
pub fn init_escrow(
    program_id: &Pubkey,
    wallet: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    escrow: &Pubkey,
    vault_owner: &Pubkey,
    vault_token: &Pubkey,
    source_token: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    reference: &Pubkey,
    args: InitEscrowArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new_readonly(*vault_owner, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(*reference, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CardInstruction::InitEscrow(args),
        accounts,
    )
}

/// Create `SettleEscrow` instruction
pub fn settle_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    destination_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: &Pubkey,
    escrow: &Pubkey,
    mint: &Pubkey,
    vault_owner: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*destination_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new(*escrow, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(*vault_owner, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CardInstruction::Settle,
        accounts,
    )
}

/// Create `CancelEscrow` instruction
pub fn cancel_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    escrow: &Pubkey,
    src_token: &Pubkey,
    vault_token: &Pubkey,
    mint: &Pubkey,
    vault_owner: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*src_token, false),
        AccountMeta::new(*vault_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(*vault_owner, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CardInstruction::Cancel,
        accounts,
    )
}

/// Create `CloseEscrow` instruction
pub fn close_escrow(
    program_id: &Pubkey,
    authority: &Pubkey,
    escrow: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CardInstruction::Close,
        accounts,
    )
}