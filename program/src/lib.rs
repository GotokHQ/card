pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;
pub mod collections;


pub const PREFIX: &str = "card";

#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{
    declare_id, pubkey::Pubkey,
};

declare_id!("cardFRMHxFN4X1urijmqb7gWSMT7bAep4Pd4LuLciG3");

/// Generates program authority
pub fn find_program_authority(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PREFIX.as_bytes(), program_id.as_ref()], program_id)
}

/// Generates funding program address
pub fn find_funding_program_address(program_id: &Pubkey, key: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PREFIX.as_bytes(), program_id.as_ref(), key.as_ref()],
        program_id,
    )
}
