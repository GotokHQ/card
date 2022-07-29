use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
};

pub const FLAG_ACCOUNT_SIZE: usize = 1;
// + 32 // user
// + 32 // collection
// + 32 // collection_fee
// + 32 // authority
// + 32 // mint
// + 8  // amount
// + 8; // fee

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Funding {
    pub is_initialized: bool,
}

impl Funding {
    pub const PREFIX: &'static str = "funding";
}

impl IsInitialized for Funding {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Sealed for Funding {}

impl Pack for Funding {
    const LEN: usize = FLAG_ACCOUNT_SIZE;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.serialize(&mut slice).unwrap()
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() != Self::LEN
        {
            msg!("Failed to deserialize");
            return Err(ProgramError::InvalidAccountData);
        }

        let result: Self = try_from_slice_unchecked(src)?;

        Ok(result)
    }
}

