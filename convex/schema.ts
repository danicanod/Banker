/**
 * Convex Schema for Bank Transaction Sync
 * 
 * Tables:
 * - banks: bank definitions (Banesco, BNC, etc.)
 * - transactions: bank transactions with idempotent txnKey
 * - events: generic event system for notifications (transaction.created, etc.)
 * - integration_state: tracks sync state for external integrations (e.g., Notion)
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Banks table
   * 
   * Contains bank definitions. Reference this from transactions.
   */
  banks: defineTable({
    // Unique code (e.g., "banesco", "bnc")
    code: v.string(),
    
    // Display name
    name: v.string(),
    
    // Optional: bank logo URL
    logoUrl: v.optional(v.string()),
    
    // Optional: bank color for UI
    color: v.optional(v.string()),
    
    // Is this bank active/enabled?
    active: v.boolean(),
    
    // Timestamps (ms since epoch)
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    
    // Notion sync fields
    notionPageId: v.optional(v.string()),
    notionLastSyncedAt: v.optional(v.number()),
    notionLastEditedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_notionPageId", ["notionPageId"]),

  /**
   * Bank transactions table
   * 
   * Each transaction has a deterministic `txnKey` that prevents duplicates.
   */
  transactions: defineTable({
    // Reference to banks table
    bankId: v.id("banks"),
    
    // Keep bank code for easy querying (denormalized)
    bankCode: v.string(),
    
    // Account identifier (optional, for multi-account support)
    accountId: v.optional(v.string()),
    
    // Deterministic unique key for idempotent inserts
    txnKey: v.string(),
    
    // Transaction details
    date: v.string(),
    amount: v.number(),
    description: v.string(),
    type: v.union(v.literal("debit"), v.literal("credit")),
    balance: v.number(),
    
    // Store the complete raw transaction for reference
    raw: v.optional(v.any()),
    
    // Timestamps (ms since epoch)
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    
    // Notion sync fields
    notionPageId: v.optional(v.string()),
    notionLastSyncedAt: v.optional(v.number()),
    notionLastEditedAt: v.optional(v.number()),
  })
    .index("by_txnKey", ["txnKey"])
    .index("by_bankId", ["bankId"])
    .index("by_bankCode", ["bankCode"])
    .index("by_bankCode_date", ["bankCode", "date"])
    .index("by_createdAt", ["createdAt"])
    .index("by_notionPageId", ["notionPageId"]),

  /**
   * Generic events table
   * 
   * Unified event system for all types of notifications.
   * Supports typed refs to related entities (transactions, banks, etc.)
   * 
   * Event types:
   * - "transaction.created": New transaction detected
   * - (future) "sync.completed", "sync.failed", etc.
   */
  events: defineTable({
    // Event type (e.g., "transaction.created", "sync.completed")
    type: v.string(),
    
    // When the event was created
    createdAt: v.number(),
    
    // Has this event been acknowledged/processed?
    acknowledged: v.boolean(),
    
    // Typed refs (optional, depending on event type)
    txnId: v.optional(v.id("transactions")),
    bankId: v.optional(v.id("banks")),
    
    // Convenience fields for transaction-created events (avoids joins for common queries)
    bankCode: v.optional(v.string()),
    amount: v.optional(v.number()),
    description: v.optional(v.string()),
    
    // Optional: Additional metadata for the event
    metadata: v.optional(v.any()),
  })
    .index("by_type", ["type"])
    .index("by_acknowledged", ["acknowledged"])
    .index("by_type_acknowledged", ["type", "acknowledged"])
    .index("by_bankId", ["bankId"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Integration state table
   * 
   * Tracks sync state for external integrations (e.g., Notion).
   * Stores cursors/timestamps to enable efficient incremental syncs.
   */
  integration_state: defineTable({
    // Integration name (e.g., "notion")
    name: v.string(),
    
    // Last pull timestamps for each entity type (ms since epoch)
    banksLastPullMs: v.optional(v.number()),
    transactionsLastPullMs: v.optional(v.number()),
    
    // General sync metadata
    lastRunMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_name", ["name"]),
});
