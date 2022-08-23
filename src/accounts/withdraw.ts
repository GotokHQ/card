import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CardProgram } from '../cardProgram';

export const MAX_WITHDRAW_DATA_LEN = 1;

export type WithdrawDataArgs = {
  isInitialized: boolean;
};

export class WithdrawData extends Borsh.Data<WithdrawDataArgs> {
  static readonly SCHEMA = WithdrawData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

  constructor(args: WithdrawDataArgs) {
    super(args);
  }
}

export class Withdraw extends Account<WithdrawData> {
  static readonly PREFIX = 'withdraw';
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = WithdrawData.deserialize(this.info.data);
    if (!this.assertOwner(CardProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    return CardProgram.findProgramAddress([
      Buffer.from(CardProgram.PREFIX),
      CardProgram.PUBKEY.toBuffer(),
      new PublicKey(key).toBuffer(),
      Buffer.from(Withdraw.PREFIX),
    ]);
  }
}
