import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';

export class CardProgram extends Program {
  static readonly PREFIX = 'card';
  static readonly PUBKEY = new PublicKey('cardFRMHxFN4X1urijmqb7gWSMT7bAep4Pd4LuLciG3');

  static async findProgramAuthority(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CardProgram.PREFIX, 'utf8'), CardProgram.PUBKEY.toBuffer()],
      CardProgram.PUBKEY,
    );
  }

  static async findFundingAccount(key: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CardProgram.PREFIX, 'utf8'), CardProgram.PUBKEY.toBuffer(), key.toBuffer()],
      CardProgram.PUBKEY,
    );
  }
}
