use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed}, pubkey::Pubkey,
};

pub const ESCROW_DATA_SIZE: usize = 213;

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Escrow {
    pub is_initialized: bool,
    pub is_settled: bool,
    pub is_canceled: bool,
    pub amount: u64,
    pub fee_bps: u16,
    pub fixed_fee: u64,
    pub src_token: Pubkey,
    pub dst_token: Pubkey,
    pub vault_token: Pubkey,
    pub fee_token: Pubkey,
    pub mint: Pubkey,
    pub reference: Pubkey,
}

impl Escrow {
    pub const PREFIX: &'static str = "escrow";
}

impl IsInitialized for Escrow {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Sealed for Escrow {}

impl Pack for Escrow {
    const LEN: usize = ESCROW_DATA_SIZE;

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

