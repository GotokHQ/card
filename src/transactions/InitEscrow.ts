import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  fee: BN;
  bump: number;
};

export class InitEscrowArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitEscrowArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['bump', 'u8'],
  ]);

  instruction = 2;
  amount: BN;
  fee: BN;
  bump: number;
}

export type InitEscrowParams = {
  amount: BN;
  fee: BN;
  reference: PublicKey;
  bump: number;
  wallet: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  escrow: PublicKey;
  vaultOwner: PublicKey;
  vaultToken: PublicKey;
  sourceToken: PublicKey;
  mint: PublicKey;
};
