import {
  Borsh,
  AnyPublicKey,
  ERROR_INVALID_OWNER,
  Account,
  StringPublicKey,
} from '@metaplex-foundation/mpl-core';
import { AccountInfo } from '@solana/web3.js';
import BN from 'bn.js';
import { CardProgram } from '../cardProgram';

export const MAX_ESCROW_DATA_LEN = 123;

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
    ['vaultToken', 'pubkeyAsString'],
    ['vaultBump', 'u8'],
    ['mint', 'pubkeyAsString'],
    ['authority', 'pubkeyAsString'],
    ['settled_at', { kind: 'option', type: 'u64' }],
  ]);
  state: EscrowState;
  amount: BN;
  fee: BN;
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
  static readonly VAULT_PREFIX = 'vault';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = EscrowData.deserialize(this.info.data);
    if (!this.assertOwner(CardProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(reference: string) {
    const [pubKey] = await CardProgram.findEscrowAccount(reference);
    return pubKey;
  }
}
