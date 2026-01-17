/**
 * Convex Schema for Bank Transaction Sync
 * 
 * Tables:
 * - banks: bank definitions (Banesco, BNC, etc.)
 * - transactions: bank transactions with idempotent txnKey
 * - newTransactionEvents: tracks newly detected transactions for notifications
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
  })
    .index("by_code", ["code"]),

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
    
    // Timestamp when inserted into Convex
    createdAt: v.number(),
  })
    .index("by_txnKey", ["txnKey"])
    .index("by_bankId", ["bankId"])
    .index("by_bankCode", ["bankCode"])
    .index("by_bankCode_date", ["bankCode", "date"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * New transaction events table
   * 
   * One record per newly inserted transaction.
   * Subscribe to this table for real-time "new transaction detected" notifications.
   */
  newTransactionEvents: defineTable({
    // Reference to the transaction
    txnId: v.id("transactions"),
    
    // Reference to the bank
    bankId: v.id("banks"),
    
    // Copy key fields for easy querying without joins
    bankCode: v.string(),
    amount: v.number(),
    description: v.string(),
    
    // When the event was created
    createdAt: v.number(),
    
    // Optional: mark as processed/acknowledged
    acknowledged: v.optional(v.boolean()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_bankId", ["bankId"])
    .index("by_acknowledged", ["acknowledged"]),
});
