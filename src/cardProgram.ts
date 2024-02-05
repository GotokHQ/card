import { PublicKey } from '@solana/web3.js';
import { Program } from '@metaplex-foundation/mpl-core';
import { Deposit, Escrow, Withdraw } from './accounts';

export class CardProgram extends Program {
  static readonly PREFIX = 'card';
  static readonly PUBKEY = new PublicKey('cardFRMHxFN4X1urijmqb7gWSMT7bAep4Pd4LuLciG3');

  static async findProgramAuthority(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(CardProgram.PREFIX, 'utf8'), CardProgram.PUBKEY.toBuffer()],
      CardProgram.PUBKEY,
    );
  }

  static async findDepositAccount(key: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from(CardProgram.PREFIX, 'utf8'),
        CardProgram.PUBKEY.toBuffer(),
        key.toBuffer(),
        Buffer.from(Deposit.PREFIX),
      ],
      CardProgram.PUBKEY,
    );
  }

  static async findWithdrawAccount(key: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from(CardProgram.PREFIX, 'utf8'),
        CardProgram.PUBKEY.toBuffer(),
        key.toBuffer(),
        Buffer.from(Withdraw.PREFIX),
      ],
      CardProgram.PUBKEY,
    );
  }

  static async findEscrowAccount(key: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from(CardProgram.PREFIX),
        CardProgram.PUBKEY.toBuffer(),
        key.toBuffer(),
        Buffer.from(Escrow.PREFIX),
      ],
      CardProgram.PUBKEY,
    );
  }

  static async findKey(key: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from(CardProgram.PREFIX, 'utf8'),
        CardProgram.PUBKEY.toBuffer(),
        Buffer.from(key, 'utf8'),
      ],
      CardProgram.PUBKEY,
    );
  }
}
