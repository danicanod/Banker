/**
 * Notion Movimientos Mutations (non-Node.js)
 * 
 * These mutations are called by the Movimientos sync actions.
 * Separated from notion_movimientos.ts because "use node" files can only export actions.
 */

import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

// ============================================================================
// Internal Mutations (for updating Convex from actions)
// ============================================================================

/**
 * Patch transaction with Notion Movimientos sync data
 */
export const patchTransactionMovimientosData = internalMutation({
  args: {
    txnId: v.id("transactions"),
    notionPageId: v.optional(v.string()),
    notionLastSyncedAt: v.optional(v.number()),
    notionLastEditedAt: v.optional(v.number()),
    // Editable fields from Notion
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { txnId, ...patch } = args;
    const now = Date.now();

    // Filter out undefined values
    const cleanPatch: Record<string, string | number | boolean> = { updatedAt: now };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        cleanPatch[key] = value;
      }
    }

    await ctx.db.patch(txnId, cleanPatch);
  },
});

/**
 * Get or create integration state for Movimientos
 */
export const getOrCreateMovimientosState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", "notion_movimientos"))
      .first();

    if (existing) {
      return existing;
    }

    const id = await ctx.db.insert("integration_state", { name: "notion_movimientos" });
    return await ctx.db.get(id);
  },
});

/**
 * Update integration state for Movimientos
 */
export const updateMovimientosState = internalMutation({
  args: {
    lastPullMs: v.optional(v.number()),
    lastRunMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, updates) => {
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", "notion_movimientos"))
      .first();

    // Map to schema fields
    const patch: Record<string, string | number | boolean> = {};
    if (updates.lastPullMs !== undefined) {
      patch.transactionsLastPullMs = updates.lastPullMs;
    }
    if (updates.lastRunMs !== undefined) {
      patch.lastRunMs = updates.lastRunMs;
    }
    if (updates.lastError !== undefined) {
      patch.lastError = updates.lastError;
    }

    if (!existing) {
      await ctx.db.insert("integration_state", {
        name: "notion_movimientos",
        ...patch,
      });
      return;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
  },
});

/**
 * Get transactions that need to be pushed to Notion Movimientos
 * 
 * Prioritizes NEW transactions (no notionPageId) over updates.
 * Uses createdAt index for efficient ordering.
 */
export const getTransactionsToPushMovimientos = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    // First, get NEW transactions (no Notion page) - these should be created first
    const newTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_createdAt")
      .order("desc")
      .filter((q) => q.eq(q.field("notionPageId"), undefined))
      .take(limit);

    // If we have room, also get transactions that need updates
    const remainingLimit = limit - newTransactions.length;
    let updatedTransactions: typeof newTransactions = [];
    
    if (remainingLimit > 0) {
      const recentTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_createdAt")
        .order("desc")
        .take(remainingLimit * 3);

      // Filter to those that have been updated since last sync
      updatedTransactions = recentTransactions.filter((txn) => {
        if (!txn.notionPageId) return false; // Already in newTransactions
        if (!txn.notionLastSyncedAt) return true;
        return (txn.updatedAt ?? 0) > txn.notionLastSyncedAt;
      }).slice(0, remainingLimit);
    }

    return [...newTransactions, ...updatedTransactions];
  },
});

/**
 * Get transaction by reference and bank code
 */
export const getTransactionByReference = internalMutation({
  args: {
    bankCode: v.string(),
    reference: v.string(),
  },
  handler: async (ctx, { bankCode, reference }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_bankCode_reference", (q) => 
        q.eq("bankCode", bankCode).eq("reference", reference)
      )
      .first();
  },
});

/**
 * Get transaction by Notion page ID
 */
export const getTransactionByNotionPageId = internalMutation({
  args: {
    notionPageId: v.string(),
  },
  handler: async (ctx, { notionPageId }) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_notionPageId", (q) => q.eq("notionPageId", notionPageId))
      .first();
  },
});

// ============================================================================
// Update Mutations (for refreshing data)
// ============================================================================

/**
 * Update transaction description by txnKey.
 * Used when re-scraping to update existing transactions with new data.
 */
export const updateTransactionDescription = internalMutation({
  args: {
    txnKey: v.string(),
    description: v.string(),
  },
  handler: async (ctx, { txnKey, description }) => {
    const txn = await ctx.db
      .query("transactions")
      .withIndex("by_txnKey", (q) => q.eq("txnKey", txnKey))
      .first();

    if (!txn) {
      return { updated: false, reason: "not_found" };
    }

    // Only update if description changed
    if (txn.description === description) {
      return { updated: false, reason: "unchanged" };
    }

    await ctx.db.patch(txn._id, { 
      description,
      updatedAt: Date.now(),
    });

    return { updated: true, txnId: txn._id };
  },
});

/**
 * Batch update transaction descriptions.
 * Returns count of updated transactions.
 * Public mutation so it can be called from sync scripts.
 */
export const batchUpdateDescriptions = mutation({
  args: {
    updates: v.array(v.object({
      txnKey: v.string(),
      description: v.string(),
    })),
  },
  handler: async (ctx, { updates }) => {
    let updatedCount = 0;
    let skippedCount = 0;

    for (const { txnKey, description } of updates) {
      const txn = await ctx.db
        .query("transactions")
        .withIndex("by_txnKey", (q) => q.eq("txnKey", txnKey))
        .first();

      if (!txn) {
        skippedCount++;
        continue;
      }

      if (txn.description === description) {
        skippedCount++;
        continue;
      }

      await ctx.db.patch(txn._id, { 
        description,
        updatedAt: Date.now(),
      });
      updatedCount++;
    }

    return { updatedCount, skippedCount };
  },
});

// ============================================================================
// Cleanup Mutations (for cleanup_movimientos.ts)
// ============================================================================

/**
 * List eligible transactions for cleanup.
 * Eligible = bankCode matches AND reference is missing/empty AND notionPageId is present.
 */
export const listEligibleCleanupTransactions = internalMutation({
  args: {
    bankCode: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bankCode, limit = 100 }) => {
    // Query by bankCode index, then filter in-memory
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_bankCode", (q) => q.eq("bankCode", bankCode))
      .collect();

    // Filter: missing reference AND has notionPageId
    const eligible = transactions.filter((txn) => {
      const hasReference = txn.reference && txn.reference.trim() !== "";
      const hasNotionPageId = !!txn.notionPageId;
      return !hasReference && hasNotionPageId;
    });

    return eligible.slice(0, limit);
  },
});

/**
 * Delete a transaction and all related events.
 * Used by cleanup to remove Convex records after archiving Notion page.
 */
export const deleteTransactionAndEvents = internalMutation({
  args: {
    txnId: v.id("transactions"),
  },
  handler: async (ctx, { txnId }) => {
    // First, delete all events referencing this transaction
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("txnId"), txnId))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Then delete the transaction itself
    await ctx.db.delete(txnId);

    return { deletedEvents: events.length, deletedTransaction: 1 };
  },
});

/**
 * Force re-sync of transactions by clearing notionLastSyncedAt
 * This will cause them to be picked up by the next push cycle.
 * Use this when you need to update Origen/Destino or other relations.
 * 
 * INTERNAL: Use triggerForceResyncTransactions action for manual execution.
 */
export const forceResyncTransactionsInternal = internalMutation({
  args: {
    bankCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bankCode, limit = 500 }) => {
    let transactions;
    
    if (bankCode) {
      transactions = await ctx.db
        .query("transactions")
        .withIndex("by_bankCode", (q) => q.eq("bankCode", bankCode))
        .take(limit);
    } else {
      transactions = await ctx.db.query("transactions").take(limit);
    }

    let updated = 0;
    const now = Date.now();

    for (const txn of transactions) {
      // Only reset if it has a notionPageId (was previously synced)
      if (txn.notionPageId) {
        await ctx.db.patch(txn._id, {
          notionLastSyncedAt: undefined,
          updatedAt: now,
        });
        updated++;
      }
    }

    return { 
      message: `Reset sync state for ${updated} transactions`,
      updated,
      bankCode: bankCode || "all"
    };
  },
});
