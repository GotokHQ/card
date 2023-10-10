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

  static async findDepositAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Deposit.PREFIX), Buffer.from(reference)],
      CardProgram.PUBKEY,
    );
  }

  static async findWithdrawAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Withdraw.PREFIX), Buffer.from(reference)],
      CardProgram.PUBKEY,
    );
  }

  static async findEscrowAccount(reference: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Escrow.PREFIX), Buffer.from(reference)],
      CardProgram.PUBKEY,
    );
  }

  static async findVaultAccount(escrow: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from(Escrow.VAULT_PREFIX), escrow.toBuffer()],
      CardProgram.PUBKEY,
    );
  }
}
