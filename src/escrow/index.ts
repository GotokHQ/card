import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Connection,
  Keypair,
  Commitment,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import BN from 'bn.js';
import { InitializePaymentInput, EscrowInput } from './types';
import { CardProgram } from '../cardProgram';
import { Escrow } from '../accounts/escrow';
import { InitEscrowArgs, InitEscrowParams } from '../transactions/InitEscrow';
import { CancelEscrowArgs, CancelEscrowParams } from '../transactions/CancelEscrow';
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

  cancel = async (input: EscrowInput): Promise<string> => {
    const escrow = await _getEscrowAccount(this.connection, new PublicKey(input.escrowAddress));

    if (escrow.data?.isCanceled) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (escrow.data?.isSettled) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const [vault] = await CardProgram.findProgramAuthority();
    const exchangeInstruction = await this.cancelInstruction({
      vaultOwner: vault,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: new PublicKey(escrow.data.srcToken),
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
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
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  cancelAndClose = async (input: EscrowInput): Promise<string> => {
    const escrow = await _getEscrowAccount(this.connection, new PublicKey(input.escrowAddress));

    if (escrow.data?.isCanceled) {
      throw new Error(ACCOUNT_ALREADY_CANCELED);
    }
    if (escrow.data?.isSettled) {
      throw new Error(ACCOUNT_ALREADY_SETTLED);
    }
    const [vault] = await CardProgram.findProgramAuthority();
    const exchangeInstruction = await this.cancelInstruction({
      vaultOwner: vault,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: new PublicKey(escrow.data.srcToken),
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
      mint: new PublicKey(escrow.data.mint),
    });
    const closeInstruction = this.closeInstruction({
      escrow: escrow.pubkey,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
    });
    const transaction = new Transaction().add(exchangeInstruction, closeInstruction);
    if (input.memo) {
      transaction.add(this.memoInstruction(input.memo, this.authority.publicKey));
    }
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash(input.commitment ?? 'finalized')
    ).blockhash;
    transaction.feePayer = this.feePayer.publicKey;
    transaction.sign(this.feePayer, this.authority);
    try {
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      return signature;
    } catch (error) {
      throw new Error(TRANSACTION_SEND_ERROR);
    }
  };

  cancelInstruction = async (params: CancelEscrowParams): Promise<TransactionInstruction> => {
    return new TransactionInstruction({
      programId: CardProgram.PUBKEY,
      data: CancelEscrowArgs.serialize(),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: params.escrow, isSigner: false, isWritable: true },
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
        { pubkey: params.vaultOwner, isSigner: false, isWritable: false },
        { pubkey: spl.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    });
  };

  close = async (input: EscrowInput): Promise<string> => {
    const exchangeInstruction = this.closeInstruction({
      escrow: new PublicKey(input.escrowAddress),
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
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
        { pubkey: params.feePayer, isSigner: false, isWritable: true },
      ],
    });
  };

  initializeEscrow = async (input: InitializePaymentInput): Promise<string> => {
    const walletAddress = new PublicKey(input.wallet);
    const mint = new PublicKey(input.mint);
    const reference = new PublicKey(input.reference);
    const [vaultOwner] = await CardProgram.findProgramAuthority();
    const [escrow, bump] = await CardProgram.findEscrowAccount(reference);
    const vaultTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
      this.connection,
      this.feePayer,
      mint,
      vaultOwner,
      true,
    );
    const amount = new BN(input.amount);
    const feeBps = input.feeBps ?? 0;
    const fixedFee = new BN(input.fixedFee ?? 0);
    const [sourceToken, destinationToken, collectionFeeToken] = await Promise.all([
      _findAssociatedTokenAddress(walletAddress, mint),
      _findAssociatedTokenAddress(this.fundingWallet, mint),
      _findAssociatedTokenAddress(this.feeWallet, mint),
    ]);
    const escrowParams: InitEscrowParams = {
      mint,
      bump,
      escrow,
      vaultOwner,
      vaultToken: vaultTokenAccount.address,
      sourceToken,
      destinationToken,
      collectionFeeToken,
      amount: amount,
      feeBps,
      fixedFee,
      reference,
      wallet: walletAddress,
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
    const {
      amount,
      feeBps,
      fixedFee,
      reference,
      bump,
      wallet,
      authority,
      escrow,
      vaultOwner,
      vaultToken,
      sourceToken,
      destinationToken,
      collectionFeeToken,
      mint,
    } = params;
    const data = InitEscrowArgs.serialize({
      amount,
      feeBps,
      fixedFee,
      bump,
    });
    const keys = [
      {
        pubkey: wallet,
        isSigner: true,
        isWritable: false,
      },
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
        pubkey: vaultOwner,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: vaultToken,
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
        pubkey: reference,
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
    const reference = new PublicKey(input.reference);
    const [deposit, bump] = await CardProgram.findDepositAccount(reference);
    const amount = new BN(input.amount);
    const feeBps = input.feeBps ?? 0;
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
      feeBps,
      key: reference,
      authority: this.authority.publicKey,
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
      feeBps,
      key,
      bump,
      user,
      authority,
      deposit,
      sourceToken,
      collectionToken,
      collectionFeeToken,
      mint,
    } = params;
    const data = InitDepositArgs.serialize({
      amount,
      feeBps,
      bump,
      key: key.toBase58(),
    });
    const keys = [
      {
        pubkey: user,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: authority,
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
    const reference = new PublicKey(input.reference);
    const [withdraw, bump] = await CardProgram.findWithdrawAccount(reference);
    const amount = new BN(input.amount);
    const feeBps = input.feeBps ?? 0;
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
      feeBps,
      key: reference,
      authority: this.authority.publicKey,
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
      feeBps,
      key,
      bump,
      wallet,
      authority,
      withdraw,
      sourceToken,
      destinationToken,
      collectionFeeToken,
      mint,
    } = params;
    const data = InitWithdrawArgs.serialize({
      amount,
      feeBps,
      bump,
      key: key.toBase58(),
    });
    const keys = [
      {
        pubkey: wallet,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: authority,
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
    const [vaultOwner] = await CardProgram.findProgramAuthority();
    const escrow = await _getEscrowAccount(this.connection, new PublicKey(input.escrowAddress));
    const transaction = new Transaction();
    const transactionInstruction = await this.settleInstruction({
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
      vaultOwner,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: new PublicKey(escrow.data.srcToken),
      destinationToken: new PublicKey(escrow.data.dstToken),
      feeToken: new PublicKey(escrow.data.feeToken),
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
    const [vaultOwner] = await CardProgram.findProgramAuthority();
    const escrow = await _getEscrowAccount(this.connection, escrowAddress);
    const settleInstruction = await this.settleInstruction({
      authority: this.authority.publicKey,
      escrow: escrow.pubkey,
      vaultOwner,
      vaultToken: new PublicKey(escrow.data.vaultToken),
      sourceToken: new PublicKey(escrow.data.srcToken),
      destinationToken: new PublicKey(escrow.data.dstToken),
      feeToken: new PublicKey(escrow.data.feeToken),
      mint: new PublicKey(escrow.data.mint),
    });
    const closeInstruction = this.closeInstruction({
      escrow: escrowAddress,
      authority: this.authority.publicKey,
      feePayer: this.feePayer.publicKey,
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
        { pubkey: params.vaultOwner, isSigner: false, isWritable: false },
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
