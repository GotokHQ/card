import { Borsh, AnyPublicKey, ERROR_INVALID_OWNER, Account } from '@metaplex-foundation/mpl-core';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { CardProgram } from '../cardProgram';

export const MAX_DATA_LEN = 1;

export type FundingDataArgs = {
  isInitialized: boolean;
};

export class FundingData extends Borsh.Data<FundingDataArgs> {
  static readonly SCHEMA = FundingData.struct([['isInitialized', 'u8']]);
  isInitialized: boolean;

  constructor(args: FundingDataArgs) {
    super(args);
  }
}

export class Funding extends Account<FundingData> {
  constructor(pubkey: AnyPublicKey, info: AccountInfo<Buffer>) {
    super(pubkey, info);
    this.data = FundingData.deserialize(this.info.data);
    if (!this.assertOwner(CardProgram.PUBKEY)) {
      throw ERROR_INVALID_OWNER();
    }
  }

  static async getPDA(key: AnyPublicKey) {
    return CardProgram.findProgramAddress([
      Buffer.from(CardProgram.PREFIX),
      CardProgram.PUBKEY.toBuffer(),
      new PublicKey(key).toBuffer(),
    ]);
  }
}
