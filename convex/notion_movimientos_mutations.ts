/**
 * Notion Movimientos Mutations (non-Node.js)
 * 
 * These mutations are called by the Movimientos sync actions.
 * Separated from notion_movimientos.ts because "use node" files can only export actions.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
    const cleanPatch: Record<string, any> = { updatedAt: now };
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
    const patch: Record<string, any> = {};
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
 */
export const getTransactionsToPushMovimientos = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    const transactions = await ctx.db.query("transactions").take(limit * 2);

    // Filter to transactions that need sync (no Notion page OR updated since last sync)
    const toSync = transactions.filter((txn) => {
      if (!txn.notionPageId) return true;
      if (!txn.notionLastSyncedAt) return true;
      return (txn.updatedAt ?? 0) > txn.notionLastSyncedAt;
    });

    return toSync.slice(0, limit);
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
