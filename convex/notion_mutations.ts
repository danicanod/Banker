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
    const cleanPatch: Record<string, string | number | boolean> = { updatedAt: now };
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
    const cleanPatch: Record<string, string | number | boolean> = {};
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

// ============================================================================
// Sync Lock (overlap prevention)
// ============================================================================

/**
 * Lock expiry time in milliseconds.
 * If a sync run takes longer than this, it's considered stale and can be overridden.
 */
const SYNC_LOCK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Try to acquire a sync lock for the given integration.
 * 
 * Uses a best-effort locking pattern:
 * - If no lock exists or lock is stale, acquire it
 * - If another run is active (not stale), return false
 * 
 * @returns Object with `acquired` boolean and `runId` if acquired
 */
export const tryAcquireSyncLock = internalMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, { name }) => {
    const now = Date.now();
    const runId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    
    // Check if there's an active lock
    if (existing?.lastError?.startsWith("RUNNING:")) {
      const parts = existing.lastError.split(":");
      const lockStarted = parseInt(parts[2] || "0", 10);
      
      // If lock is not stale, refuse to acquire
      if (now - lockStarted < SYNC_LOCK_EXPIRY_MS) {
        return { acquired: false, runId: null, reason: "another_run_active" };
      }
      // Lock is stale, we can override it
    }
    
    // Acquire the lock
    const lockValue = `RUNNING:${runId}:${now}`;
    
    if (!existing) {
      await ctx.db.insert("integration_state", {
        name,
        lastError: lockValue,
        lastRunMs: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        lastError: lockValue,
        lastRunMs: now,
      });
    }
    
    return { acquired: true, runId };
  },
});

/**
 * Release the sync lock after a successful or failed run.
 * 
 * @param name - Integration name
 * @param runId - The runId returned from tryAcquireSyncLock
 * @param success - Whether the run was successful
 * @param errorMessage - Error message if failed
 */
export const releaseSyncLock = internalMutation({
  args: {
    name: v.string(),
    runId: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { name, runId, success, errorMessage }) => {
    const now = Date.now();
    
    const existing = await ctx.db
      .query("integration_state")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    
    if (!existing) {
      return; // Nothing to release
    }
    
    // Only release if we own the lock
    if (existing.lastError?.includes(runId)) {
      const newError = success 
        ? "" 
        : `FAILED:${runId}:${now}:${errorMessage || "unknown"}`;
      
      await ctx.db.patch(existing._id, {
        lastError: newError,
        lastRunMs: now,
      });
    }
  },
});

// ============================================================================
// Bank Lookups
// ============================================================================

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
