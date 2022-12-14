import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CardProgram } from '../cardProgram';

export const MAX_DEPOSIT_DATA_LEN = 1;

export type DepositDataArgs = {
  isInitialized: boolean;
};

export class DepositData extends Borsh.Data<DepositDataArgs> {
  static readonly SCHEMA = DepositData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

  constructor(args: DepositDataArgs) {
    super(args);
  }
}

export class Deposit extends Account<DepositData> {
  static readonly PREFIX = 'deposit';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = DepositData.deserialize(this.info.data);
    if (!this.assertOwner(CardProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    return CardProgram.findProgramAddress([
      Buffer.from(CardProgram.PREFIX),
      CardProgram.PUBKEY.toBuffer(),
      new PublicKey(key).toBuffer(),
      Buffer.from(Deposit.PREFIX),
    ]);
  }
}
