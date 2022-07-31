import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class InitFundingArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitFundingArgs.struct([
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

export type InitFundingParams = {
  amount: BN;
  feeBps: number;
  key: PublicKey;
  bump: number;
  user: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  funding: PublicKey;
  sourceToken: PublicKey;
  collectionToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
