import { Borsh, StringPublicKey } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

type Args = {
  name: string;
  description: string;
  uri: string;
  mutable: boolean;
  access: BN | null;
  maxUses: BN | null;
  maxSupply: BN | null;
  price: BN;
  hasReferrer: boolean;
  hasMarketAuthority: boolean;
  referralEndDate: BN | null;
};

export class InitPassBookArgs extends Borsh.Data<Args> {
  static readonly SCHEMA = InitPassBookArgs.struct([
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['key', 'pubkeyAsString'],
  ]);

  instruction = 0;
  amount: BN;
  feeBps: number;
  key: StringPublicKey;
}

export type InitFundingParams = {
  amount: BN;
  feeBps: number;
  key: string;
  user: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  funding: PublicKey;
  sourceToken: PublicKey;
  collectionToken: PublicKey;
  collectionFeeToken: PublicKey;
  mint: PublicKey;
};
