/**
 * Unified Transaction Model and Normalization Utilities
 *
 * This module provides a unified `Transaction` type that normalizes transactions
 * from different banks into a consistent format, plus utilities for generating
 * deterministic transaction keys for idempotent storage.
 *
 * @example
 * ```typescript
 * import { normalizeTransaction, makeTxnKey, type Transaction } from '@danicanod/banker-venezuela';
 *
 * // Normalize a Banesco transaction
 * const tx = normalizeTransaction('banesco', {
 *   date: '2025-01-15',
 *   amount: 1500.50,
 *   description: 'Transfer received',
 *   type: 'credit',
 *   reference: 'REF123456'
 * });
 *
 * console.log(tx.txnKey);  // "banesco-a1b2c3d4e5f6g7h8"
 * console.log(tx.bank);    // "banesco"
 * ```
 */

import { createHash } from 'crypto';
import type { BankTransaction } from '../shared/types/base.js';
import type { BanescoTransaction } from '../banks/banesco/types/index.js';
import type { BncTransaction } from '../banks/bnc/types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported bank codes
 */
export type BankCode = 'banesco' | 'bnc';

/**
 * Unified normalized transaction model.
 *
 * This is the canonical format for storing transactions across all banks.
 * The `txnKey` provides a deterministic identifier for idempotent ingestion.
 */
export interface Transaction {
  /** Bank code (e.g., "banesco", "bnc") */
  bank: BankCode;

  /** Deterministic unique key for idempotent storage (format: "{bank}-{16_char_hash}") */
  txnKey: string;

  /** Transaction date (ISO format: YYYY-MM-DD) */
  date: string;

  /** Transaction amount (always positive) */
  amount: number;

  /** Transaction description/memo */
  description: string;

  /** Transaction type */
  type: 'debit' | 'credit';

  /** Bank reference number (when available) */
  reference?: string;

  /** Account identifier (account number or name) */
  accountId?: string;

  /** Original raw transaction data from the bank */
  raw?: unknown;
}

/**
 * Input for transaction key generation.
 *
 * Minimum fields required to generate a deterministic transaction key.
 */
export interface TxnKeyInput {
  /** Transaction date */
  date: string;
  /** Transaction amount */
  amount: number;
  /** Transaction description */
  description: string;
  /** Transaction type ("debit" or "credit") */
  type: string;
  /** Bank reference number (preferred identifier when present) */
  reference?: string;
}

/**
 * Bank-specific transaction input for normalization.
 *
 * Accepts either bank-specific types or a generic transaction object.
 */
export type BankTransactionInput =
  | BanescoTransaction
  | BncTransaction
  | BankTransaction
  | {
      id?: string;
      date: string;
      amount: number;
      description: string;
      type: 'debit' | 'credit';
      reference?: string;
      referenceNumber?: string; // BNC uses this field
      accountId?: string;
      accountName?: string; // Alternative account identifier
      balance?: number;
      [key: string]: unknown;
    };

/**
 * Options for transaction normalization.
 */
export interface NormalizeOptions {
  /**
   * Account identifier to attach to the transaction.
   * Overrides accountId/accountName from the input.
   */
  accountId?: string;

  /**
   * Whether to include the raw transaction in the output.
   * @default true
   */
  includeRaw?: boolean;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a deterministic transaction key (hash) for idempotent ingestion.
 *
 * ## Key Contract
 *
 * The key is a SHA-256 hash of: `bank|date|amount|type|reference_or_description`
 *
 * - When `reference` is present and non-empty, it's used as the unique identifier
 * - When `reference` is absent, `description` is used as fallback
 * - Amount is always absolute value (positive)
 *
 * This contract ensures consistency across:
 * - Local sync scripts
 * - Convex Browserbase sync
 * - Any other ingestion method
 *
 * @param bank - Bank code (e.g., "banesco", "bnc")
 * @param tx - Transaction data with at least date, amount, description, and type
 * @returns Deterministic key in format `{bank}-{16_char_hash}`
 *
 * @example
 * ```typescript
 * const key = makeTxnKey('banesco', {
 *   date: '2025-01-15',
 *   amount: -1500.50,
 *   description: 'ATM Withdrawal',
 *   type: 'debit'
 * });
 * // Returns: "banesco-a1b2c3d4e5f6g7h8"
 * ```
 */
export function makeTxnKey(bank: string, tx: TxnKeyInput): string {
  // Prefer reference when available (more stable identifier)
  const identifier = tx.reference?.trim() || tx.description.trim();
  const key = [
    bank,
    tx.date,
    String(Math.abs(tx.amount)),
    tx.type,
    identifier,
  ].join('|');
  return `${bank}-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a bank-specific transaction into the unified Transaction format.
 *
 * This function:
 * 1. Extracts standard fields from bank-specific formats
 * 2. Generates a deterministic `txnKey` using the key contract
 * 3. Ensures consistent field naming and types
 *
 * @param bank - Bank code (e.g., "banesco", "bnc")
 * @param tx - Bank-specific transaction object
 * @param options - Normalization options
 * @returns Normalized Transaction object
 *
 * @example
 * ```typescript
 * // Normalize a Banesco transaction
 * const normalized = normalizeTransaction('banesco', banescoTx);
 *
 * // Normalize with account override
 * const normalized = normalizeTransaction('bnc', bncTx, {
 *   accountId: 'USD-0816'
 * });
 *
 * // Normalize without raw data (smaller payload)
 * const normalized = normalizeTransaction('banesco', tx, {
 *   includeRaw: false
 * });
 * ```
 */
export function normalizeTransaction(
  bank: BankCode,
  tx: BankTransactionInput,
  options: NormalizeOptions = {}
): Transaction {
  const { accountId: overrideAccountId, includeRaw = true } = options;

  // Extract reference (BNC uses referenceNumber, others use reference)
  const reference =
    ('referenceNumber' in tx && tx.referenceNumber) ||
    ('reference' in tx && tx.reference) ||
    undefined;

  // Extract account ID (multiple possible field names)
  const accountId =
    overrideAccountId ||
    ('accountId' in tx && tx.accountId) ||
    ('accountName' in tx && tx.accountName) ||
    undefined;

  // Use existing id if present (e.g., BNC already computes ids), else generate
  const existingId = 'id' in tx && typeof tx.id === 'string' && tx.id.length > 0 ? tx.id : null;

  const txnKey =
    existingId ||
    makeTxnKey(bank, {
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      type: tx.type,
      reference,
    });

  const normalized: Transaction = {
    bank,
    txnKey,
    date: tx.date,
    amount: Math.abs(tx.amount),
    description: tx.description,
    type: tx.type,
  };

  // Add optional fields
  if (reference) {
    normalized.reference = reference;
  }

  if (accountId) {
    normalized.accountId = accountId;
  }

  if (includeRaw) {
    normalized.raw = tx;
  }

  return normalized;
}

/**
 * Normalize multiple transactions at once.
 *
 * @param bank - Bank code
 * @param transactions - Array of bank-specific transactions
 * @param options - Normalization options (applied to all)
 * @returns Array of normalized Transaction objects
 *
 * @example
 * ```typescript
 * const normalized = normalizeTransactions('bnc', bncTransactions);
 * ```
 */
export function normalizeTransactions(
  bank: BankCode,
  transactions: BankTransactionInput[],
  options: NormalizeOptions = {}
): Transaction[] {
  return transactions.map((tx) => normalizeTransaction(bank, tx, options));
}
