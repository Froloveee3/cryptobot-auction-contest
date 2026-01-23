import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { BalanceTransaction } from '../balance/schemas/balance-transaction.schema';
import type { TransactionType } from '../common/types/entities.types';

export type BalanceAuditIssue = {
  type:
    | 'TX_CHAIN_BREAK'
    | 'TX_DELTA_MISMATCH'
    | 'USER_BALANCE_MISMATCH'
    | 'NEGATIVE_AMOUNT'
    | 'UNKNOWN_TX_TYPE';
  message: string;
  txId?: string;
  expected?: string | number | boolean | null;
  actual?: string | number | boolean | null;
};

export type BalanceAuditResult = {
  userId: string;
  ok: boolean;
  issues: BalanceAuditIssue[];
  computedBalance: number;
  userBalance: number;
  transactionsCount: number;
};

function deltaForType(type: TransactionType, amount: number): number | null {
  switch (type) {
    case 'deposit':
    case 'bid_refund':
      return amount;
    case 'withdrawal':
    case 'bid_lock':
      return -amount;
    case 'bid_charge':
      return 0;
    default:
      return null;
  }
}

@Injectable()
export class BalanceAuditService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(BalanceTransaction.name) private txModel: Model<BalanceTransaction>,
  ) {}

  async auditUser(userId: string): Promise<BalanceAuditResult> {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new Error('User not found');
    }

    const txs = await this.txModel
      .find({ userId })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();

    const issues: BalanceAuditIssue[] = [];
    let balance = 0;

    for (const tx of txs as any[]) {
      const txId = tx._id?.toString?.() ?? String(tx._id);
      if (typeof tx.amount === 'number' && tx.amount < 0) {
        issues.push({ type: 'NEGATIVE_AMOUNT', message: 'Transaction amount is negative', txId });
      }

      if (tx.balanceBefore !== balance) {
        issues.push({
          type: 'TX_CHAIN_BREAK',
          message: 'balanceBefore does not match previous balanceAfter',
          txId,
          expected: balance,
          actual: tx.balanceBefore,
        });
      }

      const d = deltaForType(tx.type as TransactionType, tx.amount);
      if (d === null) {
        issues.push({
          type: 'UNKNOWN_TX_TYPE',
          message: `Unknown transaction type: ${String(tx.type)}`,
          txId,
        });
        // keep chain moving using stored balanceAfter
        balance = tx.balanceAfter;
        continue;
      }

      const expectedAfter = tx.balanceBefore + d;
      if (tx.balanceAfter !== expectedAfter) {
        issues.push({
          type: 'TX_DELTA_MISMATCH',
          message: 'balanceAfter does not match expected delta for transaction type',
          txId,
          expected: expectedAfter,
          actual: tx.balanceAfter,
        });
      }

      balance = tx.balanceAfter;
    }

    const userBalance = (user as any).balance ?? 0;
    if (userBalance !== balance) {
      issues.push({
        type: 'USER_BALANCE_MISMATCH',
        message: 'User.balance does not match computed balance from ledger',
        expected: balance,
        actual: userBalance,
      });
    }

    return {
      userId: user._id.toString(),
      ok: issues.length === 0,
      issues,
      computedBalance: balance,
      userBalance,
      transactionsCount: txs.length,
    };
  }
}

