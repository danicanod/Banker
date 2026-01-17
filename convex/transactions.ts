/**
 * Convex Mutations for Bank Transaction Ingestion
 * 
 * Provides idempotent transaction insertion with "new transaction" event emission.
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Transaction input schema (matches SDK output)
 */
const transactionInput = v.object({
  bank: v.string(), // bank code (e.g., "banesco", "bnc")
  accountId: v.optional(v.string()),
  txnKey: v.string(),
  date: v.string(),
  amount: v.number(),
  description: v.string(),
  type: v.union(v.literal("debit"), v.literal("credit")),
  balance: v.number(),
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
 * Helper: Get or create a bank by code
 */
async function getOrCreateBank(
  ctx: { db: any },
  bankCode: string
): Promise<Id<"banks">> {
  const existing = await ctx.db
    .query("banks")
    .withIndex("by_code", (q: any) => q.eq("code", bankCode))
    .first();

  if (existing) {
    return existing._id;
  }

  // Create the bank with defaults
  const defaults = BANK_DEFAULTS[bankCode] || {
    name: bankCode.charAt(0).toUpperCase() + bankCode.slice(1),
    color: "#666666",
  };

  return await ctx.db.insert("banks", {
    code: bankCode,
    name: defaults.name,
    color: defaults.color,
    active: true,
  });
}

/**
 * Internal mutation: Idempotently insert new transactions
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
        .withIndex("by_txnKey", (q: any) => q.eq("txnKey", tx.txnKey))
        .first();

      if (existing) {
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
      const txnId = await ctx.db.insert("transactions", {
        bankId,
        bankCode: tx.bank,
        accountId: accountId ?? tx.accountId,
        txnKey: tx.txnKey,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        balance: tx.balance,
        raw: tx.raw,
        createdAt: now,
      });

      // Create "new transaction detected" event
      await ctx.db.insert("newTransactionEvents", {
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

/**
 * Query: Get unacknowledged new transaction events
 */
export const getNewTransactionEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    return await ctx.db
      .query("newTransactionEvents")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .order("desc")
      .take(limit);
  },
});

/**
 * Mutation: Acknowledge a new transaction event
 */
export const acknowledgeEvent = mutation({
  args: {
    eventId: v.id("newTransactionEvents"),
  },
  handler: async (ctx, { eventId }) => {
    await ctx.db.patch(eventId, { acknowledged: true });
  },
});

/**
 * Mutation: Acknowledge all pending events
 */
export const acknowledgeAllEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const pendingEvents = await ctx.db
      .query("newTransactionEvents")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .collect();

    for (const event of pendingEvents) {
      await ctx.db.patch(event._id, { acknowledged: true });
    }

    return { acknowledgedCount: pendingEvents.length };
  },
});

/**
 * Public mutation: Ingest transactions from local script
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
        .withIndex("by_txnKey", (q: any) => q.eq("txnKey", tx.txnKey))
        .first();

      if (existing) {
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
      const txnId = await ctx.db.insert("transactions", {
        bankId,
        bankCode: tx.bank,
        accountId: tx.accountId,
        txnKey: tx.txnKey,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        balance: tx.balance,
        raw: tx.raw,
        createdAt: now,
      });

      await ctx.db.insert("newTransactionEvents", {
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        logoUrl,
        color,
        active: active ?? existing.active,
      });
      return existing._id;
    }

    return await ctx.db.insert("banks", {
      code,
      name,
      logoUrl,
      color,
      active: active ?? true,
    });
  },
});
