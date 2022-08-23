import { Borsh } from '@metaplex-foundation/mpl-core';
import { PublicKey } from '@solana/web3.js';

export class CancelEscrowArgs extends Borsh.Data {
  static readonly SCHEMA = CancelEscrowArgs.struct([['instruction', 'u8']]);

  instruction = 4;
}

export type CancelEscrowParams = {
  authority: PublicKey;
  escrow: PublicKey;
  vaultOwner: PublicKey;
  vaultToken: PublicKey;
  sourceToken: PublicKey;
  mint: PublicKey;
};
