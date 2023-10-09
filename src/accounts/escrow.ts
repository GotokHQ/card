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

export const MAX_ESCROW_DATA_LEN = 155;

export enum EscrowState {
  Uninitialized = 0,
  Initialized = 1,
  Settled = 2,
  Closed = 3,
}

export type EscrowDataArgs = {
  state: EscrowState;
  amount: BN;
  fee: BN;
  srcToken: StringPublicKey;
  vaultToken: StringPublicKey;
  vaultBump: number;
  mint: StringPublicKey;
  authority: StringPublicKey;
  settled_at?: BN;
};

export class EscrowData extends Borsh.Data<EscrowDataArgs> {
  static readonly SCHEMA = EscrowData.struct([
    ['state', 'u8'],
    ['amount', 'u64'],
    ['fee', 'u64'],
    ['srcToken', 'pubkeyAsString'],
    ['vaultToken', 'pubkeyAsString'],
    ['vaultBump', 'u8'],
    ['mint', 'pubkeyAsString'],
    ['authority', 'pubkeyAsString'],
    ['settled_at', { kind: 'option', type: 'u64' }],
  ]);
  state: EscrowState;
  amount: BN;
  fee: BN;
  srcToken: StringPublicKey;
  vaultToken: StringPublicKey;
  vaultBump: number;
  mint: StringPublicKey;
  authority: StringPublicKey;
  settled_at: BN | null;

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
