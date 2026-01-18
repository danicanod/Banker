/**
 * Notion Sync Mutations (non-Node.js)
 * 
 * These mutations are called by the Notion sync actions.
 * Separated from notion.ts because "use node" files can only export actions.
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ============================================================================
// Internal Mutations (for updating Convex from actions)
// ============================================================================

/**
 * Update bank with Notion sync data
 */
export const patchBankNotionData = internalMutation({
  args: {
    bankId: v.id("banks"),
    notionPageId: v.optional(v.string()),
    notionLastSyncedAt: v.optional(v.number()),
    notionLastEditedAt: v.optional(v.number()),
    // Fields that can be edited from Notion
    name: v.optional(v.string()),
    active: v.optional(v.boolean()),
    color: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { bankId, ...patch } = args;
    const now = Date.now();
    
    // Filter out undefined values
    const cleanPatch: Record<string, any> = { updatedAt: now };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        cleanPatch[key] = value;
      }
    }
    
    await ctx.db.patch(bankId, cleanPatch);
  },
});

/**
 * Update transaction with Notion sync data
 */
export const patchTransactionNotionData = internalMutation({
  args: {
    txnId: v.id("transactions"),
    notionPageId: v.optional(v.string()),
    notionLastSyncedAt: v.optional(v.number()),
    notionLastEditedAt: v.optional(v.number()),
    // Fields that can be edited from Notion (limited set - no identity fields)
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
 * Get or create integration state
 */
export const getOrCreateIntegrationState = internalMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    
    if (existing) {
      return existing;
    }
    
    const id = await ctx.db.insert("integration_state", { name });
    return await ctx.db.get(id);
  },
});

/**
 * Update integration state
 */
export const updateIntegrationState = internalMutation({
  args: {
    name: v.string(),
    banksLastPullMs: v.optional(v.number()),
    transactionsLastPullMs: v.optional(v.number()),
    lastRunMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, { name, ...updates }) => {
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    
    if (!existing) {
      await ctx.db.insert("integration_state", { name, ...updates });
      return;
    }
    
    // Filter out undefined values
    const cleanPatch: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanPatch[key] = value;
      }
    }
    
    if (Object.keys(cleanPatch).length > 0) {
      await ctx.db.patch(existing._id, cleanPatch);
    }
  },
});

/**
 * Get banks that need to be pushed to Notion
 */
export const getBanksToPush = internalMutation({
  args: {},
  handler: async (ctx) => {
    const banks = await ctx.db.query("banks").collect();
    
    // Filter to banks that either have no notionPageId or have been updated since last sync
    return banks.filter((bank) => {
      if (!bank.notionPageId) return true;
      if (!bank.notionLastSyncedAt) return true;
      return (bank.updatedAt ?? 0) > bank.notionLastSyncedAt;
    });
  },
});

/**
 * Get transactions that need to be pushed to Notion
 */
export const getTransactionsToPush = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    const transactions = await ctx.db.query("transactions").take(limit * 2);
    
    // Filter to transactions that need sync
    const toSync = transactions.filter((txn) => {
      if (!txn.notionPageId) return true;
      if (!txn.notionLastSyncedAt) return true;
      return (txn.updatedAt ?? 0) > txn.notionLastSyncedAt;
    });
    
    return toSync.slice(0, limit);
  },
});

/**
 * Get bank by Convex ID (for relation lookups)
 */
export const getBankById = internalMutation({
  args: {
    bankId: v.id("banks"),
  },
  handler: async (ctx, { bankId }) => {
    return await ctx.db.get(bankId);
  },
});

/**
 * Get bank by Notion page ID
 */
export const getBankByNotionPageId = internalMutation({
  args: {
    notionPageId: v.string(),
  },
  handler: async (ctx, { notionPageId }) => {
    return await ctx.db
      .query("banks")
      .withIndex("by_notionPageId", (q) => q.eq("notionPageId", notionPageId))
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
