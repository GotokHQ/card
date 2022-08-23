use borsh::BorshDeserialize;
use crate::instruction::CardInstruction;

use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod deposit;
pub mod withdraw;
pub mod escrow;


pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = CardInstruction::try_from_slice(instruction_data)?;

        match instruction {
            CardInstruction::InitDeposit(args) => {
                msg!("Instruction: Init deposit");
                deposit::init(program_id, accounts, args)
            }
            CardInstruction::InitWithdrawal(args) => {
                msg!("Instruction: Init withdraw");
                withdraw::init(program_id, accounts, args)
            }
            CardInstruction::InitEscrow(args) => {
                msg!("Instruction: InitEscrow");
                escrow::process_init_escrow(accounts, args, program_id)
            }
            CardInstruction::Settle => {
                msg!("Instruction: Settle Escrow");
                escrow::process_settlement(accounts, program_id)
            }
            CardInstruction::Cancel => {
                msg!("Instruction: Cancel Escrow");
                escrow::process_cancel(accounts, program_id)
            }
            CardInstruction::Close => {
                msg!("Instruction: Close");
                escrow::process_close(accounts, program_id)
            }
        }
    }
}
