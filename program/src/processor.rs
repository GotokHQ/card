use borsh::BorshDeserialize;
use crate::instruction::FundingInstruction;

use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod funding;


pub struct Processor;
impl Processor {
    pub fn process<'a>(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &'a [u8],
    ) -> ProgramResult {
        let instruction = FundingInstruction::try_from_slice(instruction_data)?;

        match instruction {
            FundingInstruction::Init(args) => {
                msg!("Instruction: Init funding");
                funding::init(program_id, accounts, args)
            }
        }
    }
}
