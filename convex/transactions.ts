/**
 * Convex Mutations for Bank Transaction Ingestion
 * 
 * Provides idempotent transaction insertion with generic event emission.
 * 
 * ## Idempotency
 * 
 * Transactions are deduplicated using a deterministic `txnKey`:
 * - Key formula: `sha256(bankCode + date + amount + type + reference).slice(0, 32)`
 * - Same transaction always produces the same key
 * - Duplicate ingestion attempts are skipped (not an error)
 * 
 * ## Ingestion Flow
 * 
 * 1. Check if `txnKey` exists → skip if duplicate (backfill missing fields)
 * 2. Lookup bank by `bankCode` → create if missing
 * 3. Insert transaction record
 * 4. Emit `transaction.created` event for downstream consumers
 * 
 * ## Event System
 * 
 * Every new transaction creates an event with:
 * - `type`: "transaction.created"
 * - `acknowledged`: false (set to true after processing)
 * 
 * Use `getNewTransactionEvents()` to poll for unprocessed transactions.
 * 
 * @see {@link ingestTransactions} - Internal mutation for batch ingestion
 * @see {@link ingestFromLocal} - Public mutation for local sync scripts
 */

import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Transaction input schema (matches SDK output)
 */
const transactionInput = v.object({
  bank: v.string(), // bank code (e.g., "banesco", "bnc")
  accountId: v.optional(v.string()),
  txnKey: v.string(),
  reference: v.optional(v.string()), // Bank-provided reference number
  date: v.string(),
  amount: v.number(),
  description: v.string(),
  type: v.union(v.literal("debit"), v.literal("credit")),
  balance: v.optional(v.number()), // Optional - some transactions may not have balance
  raw: v.optional(v.any()),
});

/**
 * Bank definitions for auto-creation
 */
const BANK_DEFAULTS: Record<string, { name: string; color: string }> = {
  banesco: { name: "Banesco", color: "#00529B" },
  bnc: { name: "BNC", color: "#E31837" },
};

/**
 * Event types
 */
export const EVENT_TYPES = {
  TRANSACTION_CREATED: "transaction.created",
} as const;

/**
 * Helper: Get or create a bank by code
 */
async function getOrCreateBank(
  ctx: MutationCtx,
  bankCode: string
): Promise<Id<"banks">> {
  const existing = await ctx.db
    .query("banks")
    .withIndex("by_code", (q) => q.eq("code", bankCode))
    .first();

  if (existing) {
    return existing._id;
  }

  // Create the bank with defaults
  const defaults = BANK_DEFAULTS[bankCode] || {
    name: bankCode.charAt(0).toUpperCase() + bankCode.slice(1),
    color: "#666666",
  };

  const now = Date.now();
  return await ctx.db.insert("banks", {
    code: bankCode,
    name: defaults.name,
    color: defaults.color,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Internal mutation: Idempotently insert new transactions.
 * 
 * For each transaction in the batch:
 * - Checks for existing record by `txnKey` index
 * - If exists: backfills missing `reference` or `bankCode` fields, skips insert
 * - If new: creates transaction, creates `transaction.created` event
 * 
 * @param accountId - Optional account ID to associate with all transactions
 * @param transactions - Array of transaction objects with `txnKey`, `bank`, `date`, `amount`, `type`
 * @returns Counts of inserted and skipped transactions
 * 
 * @example
 * ```typescript
 * await ctx.runMutation(internal.transactions.ingestTransactions, {
 *   transactions: [
 *     { bank: 'banesco', txnKey: 'abc123...', date: '2025-01-15', amount: 100, type: 'debit', description: 'Transfer' }
 *   ]
 * });
 * ```
 */
export const ingestTransactions = internalMutation({
  args: {
    accountId: v.optional(v.string()),
    transactions: v.array(transactionInput),
  },
  handler: async (ctx, { accountId, transactions }) => {
    const insertedIds: Id<"transactions">[] = [];
    const skippedCount = { duplicate: 0 };

    // Cache bank IDs to avoid repeated lookups
    const bankIdCache = new Map<string, Id<"banks">>();

    for (const tx of transactions) {
      // Check if transaction already exists by txnKey
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_txnKey", (q) => q.eq("txnKey", tx.txnKey))
        .first();

      if (existing) {
        // Backfill missing fields (reference, bankCode)
        const patches: Record<string, string | number | boolean> = {};
        if (tx.reference && !existing.reference) {
          patches.reference = tx.reference;
        }
        if (!existing.bankCode && tx.bank) {
          patches.bankCode = tx.bank;
        }
        if (Object.keys(patches).length > 0) {
          patches.updatedAt = Date.now();
          await ctx.db.patch(existing._id, patches);
        }
        skippedCount.duplicate++;
        continue;
      }

      // Get or create bank
      let bankId = bankIdCache.get(tx.bank);
      if (!bankId) {
        bankId = await getOrCreateBank(ctx, tx.bank);
        bankIdCache.set(tx.bank, bankId);
      }

      // Insert new transaction
      const now = Date.now();
      // Extract reference from input or from raw data if available
      const rawObj = tx.raw as Record<string, unknown> | undefined;
      const reference = tx.reference ?? 
        (typeof rawObj?.reference === 'string' ? rawObj.reference : undefined) ??
        (typeof rawObj?.referenceNumber === 'string' ? rawObj.referenceNumber : undefined);
      const txnId = await ctx.db.insert("transactions", {
        bankId,
        bankCode: tx.bank,
        accountId: accountId ?? tx.accountId,
        txnKey: tx.txnKey,
        reference: reference || undefined,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        balance: tx.balance,
        raw: tx.raw,
        createdAt: now,
        updatedAt: now,
      });

      // Create "transaction.created" event
      await ctx.db.insert("events", {
        type: EVENT_TYPES.TRANSACTION_CREATED,
        txnId,
        bankId,
        bankCode: tx.bank,
        amount: tx.amount,
        description: tx.description,
        createdAt: now,
        acknowledged: false,
      });

      insertedIds.push(txnId);
    }

    return {
      insertedCount: insertedIds.length,
      insertedIds,
      skippedDuplicates: skippedCount.duplicate,
      totalProcessed: transactions.length,
    };
  },
});

/**
 * Query: Get all banks
 */
export const getBanks = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("banks").collect();
  },
});

/**
 * Query: Get recent transactions
 */
export const getRecentTransactions = query({
  args: {
    bank: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bank, limit = 50 }) => {
    if (bank) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_bankCode", (q) => q.eq("bankCode", bank))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("transactions").order("desc").take(limit);
  },
});

/**
 * Query: Get transactions by bank ID
 */
export const getTransactionsByBank = query({
  args: {
    bankId: v.id("banks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bankId, limit = 50 }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_bankId", (q) => q.eq("bankId", bankId))
      .order("desc")
      .take(limit);
  },
});

// ============================================================================
// Generic Events API
// ============================================================================

/**
 * Query: Get events with optional filtering
 */
export const getEvents = query({
  args: {
    type: v.optional(v.string()),
    acknowledged: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { type, acknowledged, limit = 50 }) => {
    // Filter by type + acknowledged status
    if (type !== undefined && acknowledged !== undefined) {
      return await ctx.db
        .query("events")
        .withIndex("by_type_acknowledged", (q) =>
          q.eq("type", type).eq("acknowledged", acknowledged)
        )
        .order("desc")
        .take(limit);
    }

    // Filter by type only
    if (type !== undefined) {
      return await ctx.db
        .query("events")
        .withIndex("by_type", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
    }

    // Filter by acknowledged status only
    if (acknowledged !== undefined) {
      return await ctx.db
        .query("events")
        .withIndex("by_acknowledged", (q) => q.eq("acknowledged", acknowledged))
        .order("desc")
        .take(limit);
    }

    // No filters - return all events
    return await ctx.db.query("events").order("desc").take(limit);
  },
});

/**
 * Query: Get unacknowledged events (shorthand for common use case)
 * Backwards compatible with old getNewTransactionEvents
 */
export const getNewTransactionEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    return await ctx.db
      .query("events")
      .withIndex("by_type_acknowledged", (q) =>
        q.eq("type", EVENT_TYPES.TRANSACTION_CREATED).eq("acknowledged", false)
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Mutation: Acknowledge a single event
 */
export const acknowledgeEvent = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    await ctx.db.patch(eventId, { acknowledged: true });
  },
});

/**
 * Mutation: Acknowledge all pending events (optionally filtered by type)
 */
export const acknowledgeAllEvents = mutation({
  args: {
    type: v.optional(v.string()),
  },
  handler: async (ctx, { type }) => {
    let pendingEvents;

    if (type !== undefined) {
      pendingEvents = await ctx.db
        .query("events")
        .withIndex("by_type_acknowledged", (q) =>
          q.eq("type", type).eq("acknowledged", false)
        )
        .collect();
    } else {
      pendingEvents = await ctx.db
        .query("events")
        .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
        .collect();
    }

    for (const event of pendingEvents) {
      await ctx.db.patch(event._id, { acknowledged: true });
    }

    return { acknowledgedCount: pendingEvents.length };
  },
});

/**
 * Public mutation: Ingest transactions from local sync scripts.
 * 
 * Same behavior as `ingestTransactions` but exposed as a public mutation
 * for use with `ConvexHttpClient` from local Node.js scripts.
 * 
 * Call from local scripts via:
 * ```typescript
 * import { ConvexHttpClient } from 'convex/browser';
 * const client = new ConvexHttpClient(process.env.CONVEX_URL);
 * await client.mutation(api.transactions.ingestFromLocal, { transactions: [...] });
 * ```
 * 
 * @param transactions - Array of transaction objects (same schema as ingestTransactions)
 * @returns Counts of inserted and skipped transactions
 */
export const ingestFromLocal = mutation({
  args: {
    transactions: v.array(transactionInput),
  },
  handler: async (ctx, { transactions }) => {
    const insertedIds: Id<"transactions">[] = [];
    const skippedCount = { duplicate: 0 };

    // Cache bank IDs
    const bankIdCache = new Map<string, Id<"banks">>();

    for (const tx of transactions) {
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_txnKey", (q) => q.eq("txnKey", tx.txnKey))
        .first();

      if (existing) {
        // Backfill missing fields (reference, bankCode) even for duplicates
        const patches: Record<string, string | number | boolean> = {};
        const rawObj = tx.raw as Record<string, unknown> | undefined;
        const incomingRef = tx.reference ?? 
          (typeof rawObj?.reference === 'string' ? rawObj.reference : undefined) ??
          (typeof rawObj?.referenceNumber === 'string' ? rawObj.referenceNumber : undefined);
        if (incomingRef && !existing.reference) {
          patches.reference = incomingRef;
        }
        if (!existing.bankCode && tx.bank) {
          patches.bankCode = tx.bank;
        }
        if (Object.keys(patches).length > 0) {
          patches.updatedAt = Date.now();
          await ctx.db.patch(existing._id, patches);
        }
        skippedCount.duplicate++;
        continue;
      }

      // Get or create bank
      let bankId = bankIdCache.get(tx.bank);
      if (!bankId) {
        bankId = await getOrCreateBank(ctx, tx.bank);
        bankIdCache.set(tx.bank, bankId);
      }

      const now = Date.now();
      // Extract reference from input or from raw data if available
      const rawObjInsert = tx.raw as Record<string, unknown> | undefined;
      const referenceInsert = tx.reference ?? 
        (typeof rawObjInsert?.reference === 'string' ? rawObjInsert.reference : undefined) ??
        (typeof rawObjInsert?.referenceNumber === 'string' ? rawObjInsert.referenceNumber : undefined);
      const txnId = await ctx.db.insert("transactions", {
        bankId,
        bankCode: tx.bank,
        accountId: tx.accountId,
        txnKey: tx.txnKey,
        reference: referenceInsert || undefined,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        balance: tx.balance,
        raw: tx.raw,
        createdAt: now,
        updatedAt: now,
      });

      // Create "transaction.created" event
      await ctx.db.insert("events", {
        type: EVENT_TYPES.TRANSACTION_CREATED,
        txnId,
        bankId,
        bankCode: tx.bank,
        amount: tx.amount,
        description: tx.description,
        createdAt: now,
        acknowledged: false,
      });

      insertedIds.push(txnId);
    }

    return {
      insertedCount: insertedIds.length,
      insertedIds,
      skippedDuplicates: skippedCount.duplicate,
    };
  },
});

/**
 * Mutation: Create or update a bank
 */
/**
 * One-time backfill: Set bankCode on all transactions missing it
 * Run this after schema migration to fix existing data
 */
export const backfillBankCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all banks to create a bankId -> code mapping
    const banks = await ctx.db.query("banks").collect();
    const bankIdToCode: Record<string, string> = {};
    for (const bank of banks) {
      bankIdToCode[bank._id] = bank.code;
    }

    // Get all transactions missing bankCode
    const transactions = await ctx.db.query("transactions").collect();
    let updated = 0;

    for (const txn of transactions) {
      if (!txn.bankCode && txn.bankId) {
        const bankCode = bankIdToCode[txn.bankId];
        if (bankCode) {
          await ctx.db.patch(txn._id, {
            bankCode,
            updatedAt: Date.now(),
          });
          updated++;
        }
      }
    }

    return { updated, total: transactions.length };
  },
});

/**
 * One-time backfill: Extract reference from raw data for transactions missing it
 * Run this to fix existing transactions that have reference in raw but not at top level
 */
export const backfillReferences = internalMutation({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").collect();
    let updated = 0;

    for (const txn of transactions) {
      // Skip if already has reference
      if (txn.reference) continue;

      // Try to extract reference from raw data
      const raw = txn.raw as Record<string, unknown> | undefined;
      const reference = 
        (typeof raw?.reference === 'string' ? raw.reference : undefined) ??
        (typeof raw?.referenceNumber === 'string' ? raw.referenceNumber : undefined);

      if (reference) {
        await ctx.db.patch(txn._id, {
          reference,
          updatedAt: Date.now(),
        });
        updated++;
      }
    }

    return { updated, total: transactions.length };
  },
});

/**
 * Mutation: Create or update a bank
 */
export const upsertBank = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { code, name, logoUrl, color, active }) => {
    const existing = await ctx.db
      .query("banks")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        logoUrl,
        color,
        active: active ?? existing.active,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("banks", {
      code,
      name,
      logoUrl,
      color,
      active: active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
