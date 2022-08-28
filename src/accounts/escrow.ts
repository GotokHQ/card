import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { CardProgram } from '../cardProgram';

export const MAX_ESCROW_DATA_LEN = 213;

export type EscrowDataArgs = {
  isInitialized: boolean;
  isSettled: boolean;
  isCanceled: boolean;
  amount: BN;
  feeBps: number;
  srcToken: StringPublicKey;
  dstToken: StringPublicKey;
  vaultToken: StringPublicKey;
  feeToken: StringPublicKey;
  mint: StringPublicKey;
};

export class EscrowData extends Borsh.Data<EscrowDataArgs> {
  static readonly SCHEMA = EscrowData.struct([
    ['isInitialized', 'u8'],
    ['isSettled', 'u8'],
    ['isCanceled', 'u8'],
    ['amount', 'u64'],
    ['feeBps', 'u16'],
    ['fixedFee', 'u64'],
    ['srcToken', 'pubkeyAsString'],
    ['dstToken', 'pubkeyAsString'],
    ['vaultToken', 'pubkeyAsString'],
    ['feeToken', 'pubkeyAsString'],
    ['mint', 'pubkeyAsString'],
    ['reference', 'pubkeyAsString'],
  ]);
  isInitialized: boolean;
  isSettled: boolean;
  isCanceled: boolean;
  amount: BN;
  feeBps: number;
  fixedFee: BN;
  srcToken: StringPublicKey;
  dstToken: StringPublicKey;
  vaultToken: StringPublicKey;
  feeToken: StringPublicKey;
  mint: StringPublicKey;
  reference: StringPublicKey;

  constructor(args: EscrowDataArgs) {
    super(args);
  }
}

export class Escrow extends Account<EscrowData> {
  static readonly PREFIX = 'escrow';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = EscrowData.deserialize(this.info.data);
    if (!this.assertOwner(CardProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    const [pubKey] = await CardProgram.findEscrowAccount(new PublicKey(key));
    return pubKey;
  }
}
