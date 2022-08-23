import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
};

export class InitEscrowArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitEscrowArgs.struct([
    ['instruction', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['key', 'pubkeyAsString'],
    ['bump', 'u8'],
  ]);

  instruction = 2;
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
  bump: number;
}

export type InitEscrowParams = {
  amount: BN;
  feeBps: number;
  key: PublicKey;
  bump: number;
  wallet: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  escrow: PublicKey;
  vaultOwner: PublicKey;
  vaultToken: PublicKey;
  sourceToken: PublicKey;
  destinationToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
