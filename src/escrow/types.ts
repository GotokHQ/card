export interface InitializePaymentOutput {
  message: string;
  signatures: Sig[];
  escrowAddress: string;
}

export interface Sig {
  pubKey: string;
  signature?: string | null;
}

export interface InitializePaymentInput {
  wallet: string;
  destination: string;
  fee: string;
  mint: string;
  key: string;
  amount: string;
  feeBps?: number;
  memo?: string;
}
export interface SettlePaymentInput {
  walletAddress: string;
  amount: string;
  escrowAddress: string;
  memo?: string;
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

export interface CancelPaymentInput {
  escrowAddress: string;
  memo?: string;
}

export interface CancelPaymentOutput {
  signature: string;
}

export interface ClosePaymentInput {
  escrowAddress: string;
  memo?: string;
}

export interface SettlePaymentOutput {
  signature: string;
  destinationWalletAddress: string;
}
