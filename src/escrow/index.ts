import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Connection,
  Keypair,
  Commitment,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import BN from 'bn.js';
import { InitializePaymentInput, EscrowInput } from './types';
import { CardProgram } from '../cardProgram';
import { Escrow, EscrowState } from '../accounts/escrow';
import { InitEscrowArgs, InitEscrowParams } from '../transactions/InitEscrow';
import { CloseEscrowArgs, CloseEscrowParams } from '../transactions/CloseEscrow';
import { SettleEscrowArgs, SettleEscrowParams } from '../transactions/SettleEscrow';
import { InitDepositArgs, InitDepositParams } from '../transactions/InitDeposit';
import { InitWithdrawArgs, InitWithdrawParams } from '../transactions';
import { Deposit, Withdraw } from '../accounts';
import { Account } from '@metaplex-foundation/mpl-core';

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid authority';
export const INVALID_PAYER_ADDRESS = 'Invalid payer address';
export const ACCOUNT_ALREADY_CANCELED = 'Account already canceled';
export const ACCOUNT_ALREADY_SETTLED = 'Account already settled';
export const ACCOUNT_NOT_INITIALIZED_OR_SETTLED = 'Account not initialized or settled';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';
export const MEMO_PROGRAM_ID = new PublicKey('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');

export class EscrowClient {
  private feePayer: Keypair;
  private authority: Keypair;
  private withdrawalWallet: Keypair;
  private feeWallet: PublicKey;
  private fundingWallet: PublicKey;
  private connection: Connection;

  constructor(
    feePayer: Keypair,
    authority: Keypair,
    feeWallet: PublicKey,
    fundingWallet: PublicKey,
    withdrawalWallet: Keypair,
    connection: Connection,
  ) {
    this.feePayer = feePayer;
    this.authority = authority;
    this.feeWallet = feeWallet;
    this.fundingWallet = fundingWallet;
    this.withdrawalWallet = withdrawalWallet;
    this.connection = connection;
  }

  close = async (input: EscrowInput): Promise<string> => {
    const walletAddress = new PublicKey(input.walletAddress);
    const escrow = await _getEscrowAccount(this.connection, new PublicKey(input.escrowAddress));
    if (
      !(
        escrow.data?.state === EscrowState.Initialized || escrow.data?.state === EscrowState.Settled
      )
    ) {
      throw new Error(ACCOUNT_NOT_INITIALIZED_OR_SETTLED);
    }
    const dstTokenAddress = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      new PublicKey(escrow.data.mint),
      walletAddress,
      true,
    );
    const exchangeInstruction = this.closeInstruction({
      escrow: new PublicKey(input.escrowAddress),
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: dstTokenAddress.address,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
      mint: new PublicKey(escrow.data.mint),
    });
    const transaction = new Transaction().add(exchangeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    return await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
    });
  };

  closeInstruction = (params: CloseEscrowParams): TransactionInstruction => {
    return new TransactionInstruction({
      programId: CardProgram.PUBKEY,
      data: CloseEscrowArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        {
          pubkey: params.escrow,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: params.sourceToken,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: params.vaultToken,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        { pubkey: params.feePayer, isSigner: false, isWritable: true },
        {
          pubkey: SYSVAR_RENT_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  initializeEscrow = async (input: InitializePaymentInput): Promise<string> => {
    const mint = new PublicKey(input.mint);
    const [escrow, escrow_bump] = await CardProgram.findEscrowAccount(input.reference);
    const [vaultTokenAccount, vault_bump] = await CardProgram.findVaultAccount(escrow);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    const escrowParams: InitEscrowParams = {
      mint,
      escrow_bump,
      vault_bump,
      escrow,
      vaultToken: vaultTokenAccount,
      amount: amount,
      fee,
      reference: input.reference,
      authority: this.authority.publicKey,
      payer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initInstruction(escrowParams));
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  initInstruction = (params: InitEscrowParams): TransactionInstruction => {
    const { amount, fee, reference, vault_bump, escrow_bump, authority, escrow, vaultToken, mint } =
      params;
    const data = InitEscrowArgs.serialize({
      amount,
      fee,
      vault_bump,
      escrow_bump,
      reference,
    });
    const keys = [
      {
        pubkey: authority,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: this.feePayer.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: escrow,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: vaultToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new TransactionInstruction({
      keys,
      data,
      programId: CardProgram.PUBKEY,
    });
  };

  initializeDeposit = async (input: InitializePaymentInput): Promise<string> => {
    const walletAddress = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const [deposit, bump] = await CardProgram.findDepositAccount(input.reference);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    // const fixedFee = new BN(input.fixedFee ?? 0);
    const [sourceToken, destinationToken, collectionFeeToken] = await Promise.all([
      _findAssociatedTokenAddress(walletAddress, mint),
      _findAssociatedTokenAddress(this.fundingWallet, mint),
      _findAssociatedTokenAddress(this.feeWallet, mint),
    ]);
    const depositParams: InitDepositParams = {
      mint,
      user: walletAddress,
      bump,
      deposit,
      sourceToken,
      collectionToken: destinationToken,
      collectionFeeToken,
      amount: amount,
      fee,
      reference: input.reference,
      payer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initDeposit(depositParams));
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  initDeposit = (params: InitDepositParams) => {
    const {
      amount,
      fee,
      reference,
      bump,
      user,
      deposit,
      sourceToken,
      collectionToken,
      collectionFeeToken,
      mint,
    } = params;
    const data = InitDepositArgs.serialize({
      amount,
      fee,
      bump,
      reference,
    });
    const keys = [
      {
        pubkey: user,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: this.feePayer.publicKey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: deposit,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: sourceToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: collectionToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: collectionFeeToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new TransactionInstruction({
      keys,
      data,
      programId: CardProgram.PUBKEY,
    });
  };

  initializeWithdrawal = async (input: InitializePaymentInput): Promise<string> => {
    const walletAddress = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const [withdraw, bump] = await CardProgram.findWithdrawAccount(input.reference);
    const amount = new BN(input.amount);
    const fee = new BN(input.fee ?? 0);
    // const fixedFee = new BN(input.fixedFee ?? 0);
    const [sourceToken, collectionFeeToken] = await Promise.all([
      _findAssociatedTokenAddress(this.withdrawalWallet.publicKey, mint),
      _findAssociatedTokenAddress(this.feeWallet, mint),
    ]);
    const destinationToken = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      mint,
      walletAddress,
      true,
    );
    const withdrawalParams: InitWithdrawParams = {
      mint,
      wallet: this.withdrawalWallet.publicKey,
      bump,
      withdraw,
      sourceToken,
      destinationToken: destinationToken.address,
      collectionFeeToken,
      amount: amount,
      fee,
      reference: input.reference,
      payer: this.feePayer.publicKey,
    };

    const transaction = new Transaction();
    transaction.add(this.initWithdrawal(withdrawalParams));
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    const { blockhash } = await this.connection.getLatestBlockhash(input.commitment ?? 'finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer, this.authority, this.withdrawalWallet);
    return transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');
  };

  initWithdrawal = (params: InitWithdrawParams) => {
    const {
      amount,
      fee,
      reference,
      bump,
      wallet,
      withdraw,
      sourceToken,
      destinationToken,
      collectionFeeToken,
      mint,
    } = params;
    const data = InitWithdrawArgs.serialize({
      amount,
      fee,
      bump,
      reference,
    });
    const keys = [
      {
        pubkey: wallet,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: this.feePayer.publicKey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: withdraw,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: sourceToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: destinationToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: collectionFeeToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new TransactionInstruction({
      keys,
      data,
      programId: CardProgram.PUBKEY,
    });
  };

  send = async (payload: string): Promise<string> => {
    const buffer = Buffer.from(payload, 'base64');
    const txIx = Transaction.from(buffer);
    if (!txIx.verifySignatures()) {
      throw Error(INVALID_SIGNATURE);
    }
    return this.connection.sendRawTransaction(buffer, {
      skipPreflight: false,
    });
  };

  settle = async (input: EscrowInput): Promise<string> => {
    const escrowAddress = new PublicKey(input.escrowAddress);
    const walletAddress = new PublicKey(input.walletAddress);
    const escrow = await _getEscrowAccount(this.connection, escrowAddress);
    const dstTokenAddress = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      new PublicKey(escrow.data.mint),
      walletAddress,
      true,
    );
    const feeTokenAddress = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      new PublicKey(escrow.data.mint),
      this.feeWallet,
      true,
    );
    const transaction = new Transaction();
    const transactionInstruction = await this.settleInstruction({
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      destinationToken: dstTokenAddress.address,
      feeToken: feeTokenAddress.address,
      mint: new PublicKey(escrow.data.mint),
    });
    transaction.add(transactionInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
    });
    return signature;
  };

  settleAndClose = async (input: EscrowInput): Promise<string> => {
    const escrowAddress = new PublicKey(input.escrowAddress);
    const walletAddress = new PublicKey(input.walletAddress);
    const escrow = await _getEscrowAccount(this.connection, escrowAddress);
    const dstTokenAddress = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      new PublicKey(escrow.data.mint),
      walletAddress,
      true,
    );
    const feeTokenAddress = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      new PublicKey(escrow.data.mint),
      this.feeWallet,
      true,
    );
    const settleInstruction = await this.settleInstruction({
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      destinationToken: dstTokenAddress.address,
      feeToken: feeTokenAddress.address,
      mint: new PublicKey(escrow.data.mint),
    });
    const closeInstruction = this.closeInstruction({
      escrow: escrowAddress,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: dstTokenAddress.address,
      mint: new PublicKey(escrow.data.mint),
    });
    const transaction = new Transaction();
    transaction.add(settleInstruction);
    transaction.add(closeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
      });
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  settleInstruction = async (params: SettleEscrowParams): Promise<TransactionInstruction> => {
    return new TransactionInstruction({
      programId: CardProgram.PUBKEY,
      data: SettleEscrowArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: params.destinationToken, isSigner: false, isWritable: true },
        { pubkey: params.feeToken, isSigner: false, isWritable: true },
        {
          pubkey: params.vaultToken,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: params.escrow, isSigner: false, isWritable: true },
        { pubkey: params.mint, isSigner: false, isWritable: false },
        {
          pubkey: SYSVAR_CLOCK_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: spl.TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  signTransaction = (transaction: Transaction): Buffer => {
    transaction.feePayer = this.feePayer.publicKey;
    transaction.partialSign(this.feePayer);
    return transaction.serialize();
  };

  memoInstruction = (memo: string, signer?: PublicKey) => {
    const keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];
    if (signer) {
      keys.push({ pubkey: signer, isSigner: true, isWritable: false });
    }
    return new TransactionInstruction({
      keys: keys,
      data: Buffer.from(memo, 'utf-8'),
      programId: MEMO_PROGRAM_ID,
    });
  };

  getEscrow = async (address: PublicKey, commitment?: Commitment): Promise<Escrow> => {
    try {
      return await _getEscrowAccount(this.connection, address, commitment);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };

  getWithdraw = async (address: PublicKey): Promise<Withdraw> => {
    try {
      return await _getWithdrawAccount(this.connection, address);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };

  getDeposit = async (address: PublicKey): Promise<Withdraw> => {
    try {
      return await _getDepositAccount(this.connection, address);
    } catch (error) {
      if (error.message === FAILED_TO_FIND_ACCOUNT) {
        return null;
      }
      throw error;
    }
  };
}

const _findAssociatedTokenAddress = async (
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey,
) => {
  return (
    await PublicKey.findProgramAddress(
      [walletAddress.toBuffer(), spl.TOKEN_PROGRAM_ID.toBuffer(), tokenMintAddress.toBuffer()],
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  )[0];
};

const _getEscrowAccount = async (
  connection: Connection,
  escrowAddress: PublicKey,
  commitment?: Commitment,
): Promise<Escrow | null> => {
  try {
    const accountInfo = await connection.getAccountInfo(escrowAddress, commitment);
    if (accountInfo == null) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    const escrow = Escrow.from(new Account(escrowAddress, accountInfo));
    return escrow;
  } catch (error) {
    return null;
  }
};

const _getWithdrawAccount = async (
  connection: Connection,
  address: PublicKey,
): Promise<Withdraw> => {
  try {
    const withdraw = await Withdraw.load(connection, address);
    if (!withdraw || !withdraw.info) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (!withdraw || !withdraw.info) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    return withdraw;
  } catch (error) {
    throw new Error(FAILED_TO_FIND_ACCOUNT);
  }
};

const _getDepositAccount = async (connection: Connection, address: PublicKey): Promise<Deposit> => {
  try {
    const deposit = await Deposit.load(connection, address);
    if (!deposit || !deposit.info) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    if (!deposit || !deposit.info) {
      throw new Error(FAILED_TO_FIND_ACCOUNT);
    }
    return deposit;
  } catch (error) {
    throw new Error(FAILED_TO_FIND_ACCOUNT);
  }
};
