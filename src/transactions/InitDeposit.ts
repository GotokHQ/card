import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class InitDepositArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitDepositArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['key', 'pubkeyAsString'],
    ['bump', 'u8'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
}

export type InitDepositParams = {
  amount: BN;
  feeBps: number;
  key: PublicKey;
  bump: number;
  user: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  deposit: PublicKey;
  sourceToken: PublicKey;
  collectionToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
