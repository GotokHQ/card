import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export class CloseEscrowArgs extends Borsh.Data {
  static readonly SCHEMA = CloseEscrowArgs.struct([['instruction', 'u8']]);

  instruction = 5;
}

export type CloseEscrowParams = {
  authority: PublicKey;
  sourceToken: PublicKey;
  vaultToken: PublicKey;
  mint: PublicKey;
  escrow: PublicKey;
  feePayer: PublicKey;
};
