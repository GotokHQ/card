import { Commitment } from '@solana/web3.js';

export interface InitializePaymentOutput {
  message: string;
  signatures: Sig[];
}

export interface Sig {
  pubKey: string;
  signature?: string | null;
}

export interface InitializePaymentInput {
  wallet: string;
  mint: string;
  key: string;
  amount: number;
  feeBps?: number;
  memo?: string;
  serializeInWireFormat?: boolean;
  commitment?: Commitment;
}
export interface EscrowInput {
  escrowAddress: string;
  memo?: string;
  commitment?: Commitment;
}

export interface SettleAndTransferInput {
  walletAddress: string;
  transferTokenMintAddress: string;
  amountToSettle: string;
  amountToTransfer: string;
  escrowAddress: string;
  memo?: string;
  fee?: string;
}

export interface CancelPaymentOutput {
  signature: string;
}
