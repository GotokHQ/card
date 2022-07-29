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
pub struct FundingArgs {
    /// The total amount of token X to be paid by the payer
    pub amount: u64,
    /// The fee to collect
    pub fee_bps: u16,
    /// The unique transaction key
    pub key: Pubkey,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub enum FundingInstruction {
    /// Starts the trade by creating and populating an escrow account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the user initializing the fund
    /// 2. `[signer]` The authority responsible for approving due to some external conditions
    /// 3. `[writable]` The funding account, it will hold all necessary info about the transaction.
    /// 4. `[writable]` The source token account that will fund the transaction
    /// 4. `[writable]` The collection token account that will receive the amount
    /// 5. `[writable]` The collection fee token account that will receive the fee if the transaction is successful
    /// 5. `[]` The token mint
    /// 7. `[]` The rent sysvar
    /// 8. `[]` The token program
    Init(FundingArgs),
}

/// Create `EditPassBook` instruction
pub fn funding(
    program_id: &Pubkey,
    user: &Pubkey,
    authority: &Pubkey,
    payer: &Pubkey,
    funding: &Pubkey,
    source_token: &Pubkey,
    collection_token: &Pubkey,
    collection_fee_token: &Pubkey,
    mint: &Pubkey,
    args: FundingArgs,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*user, true),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*payer, true),
        AccountMeta::new(*funding, false),
        AccountMeta::new(*source_token, false),
        AccountMeta::new(*collection_token, false),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new_readonly(*mint, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false), 
    ];

    Instruction::new_with_borsh(
        *program_id,
        &FundingInstruction::Init(args),
        accounts,
    )
}
