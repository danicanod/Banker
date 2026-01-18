/**
 * Notion Sync Actions for Convex
 * 
 * Bidirectional sync between Convex (banks, transactions) and Notion databases.
 * - Push: Convex → Notion (create/update pages)
 * - Pull: Notion → Convex (edits-only, no creates from Notion)
 * - Conflict resolution: last-write-wins by timestamp
 * 
 * Required environment variables:
 * - NOTION_API_TOKEN: Notion integration token
 * - NOTION_BANKS_DATABASE_ID: Notion database ID for banks
 * - NOTION_TRANSACTIONS_DATABASE_ID: Notion database ID for transactions
 * - NOTION_SYNC_SECRET: (optional) Secret for manual trigger
 */
"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// ============================================================================
// Notion Property Name Constants
// ============================================================================

/**
 * Property names in Notion databases.
 * Centralized here for easy renaming.
 */
const NOTION_PROPS = {
  // Banks DB properties
  BANK_NAME: "Name", // Title property
  BANK_CODE: "Code",
  BANK_ACTIVE: "Active",
  BANK_COLOR: "Color",
  BANK_LOGO_URL: "Logo URL",
  BANK_CONVEX_ID: "Convex ID",

  // Transactions DB properties
  TXN_TITLE: "Title", // Title property (description or derived)
  TXN_KEY: "Transaction Key",
  TXN_DATE: "Date",
  TXN_AMOUNT: "Amount",
  TXN_TYPE: "Type",
  TXN_BALANCE: "Balance",
  TXN_ACCOUNT_ID: "Account ID",
  TXN_BANK: "Bank", // Relation to Banks DB
  TXN_CONVEX_ID: "Convex ID",
  TXN_DESCRIPTION: "Description",
} as const;

// ============================================================================
// Types
// ============================================================================

type SyncResult = {
  success: boolean;
  banksCreated: number;
  banksUpdated: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  banksPulled: number;
  transactionsPulled: number;
  errors: string[];
};

type NotionPage = PageObjectResponse;

/** Notion rich text element structure */
interface NotionRichTextItem {
  plain_text: string;
}

/** Notion relation item structure */
interface NotionRelationItem {
  id: string;
}

/** Notion property value types used in this codebase */
type NotionPropertyInput = 
  | { title: { text: { content: string } }[] }
  | { rich_text: { text: { content: string } }[] }
  | { number: number }
  | { checkbox: boolean }
  | { select: { name: string } }
  | { date: { start: string } }
  | { url: string }
  | { relation: { id: string }[] };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Initialize Notion client
 */
function getNotionClient(): Client {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) {
    throw new Error("Missing NOTION_API_TOKEN environment variable");
  }
  return new Client({ auth: token });
}

/**
 * Get required database IDs from environment
 */
function getDatabaseIds(): { banks: string; transactions: string } {
  const banks = process.env.NOTION_BANKS_DATABASE_ID;
  const transactions = process.env.NOTION_TRANSACTIONS_DATABASE_ID;
  
  if (!banks || !transactions) {
    throw new Error(
      "Missing NOTION_BANKS_DATABASE_ID or NOTION_TRANSACTIONS_DATABASE_ID"
    );
  }
  
  return { banks, transactions };
}

/**
 * Convert Notion ISO date to ms timestamp
 */
function notionDateToMs(isoDate: string): number {
  return new Date(isoDate).getTime();
}

/**
 * Extract text from Notion rich text array
 */
function extractRichText(richText: NotionRichTextItem[] | undefined): string {
  return richText?.map((t) => t.plain_text).join("") || "";
}

/**
 * Extract property value from Notion page
 */
function getPropertyValue(page: NotionPage, propName: string): string | number | boolean | string[] | undefined {
  const prop = page.properties[propName];
  if (!prop) return undefined;

  switch (prop.type) {
    case "title":
      return extractRichText(prop.title as NotionRichTextItem[]);
    case "rich_text":
      return extractRichText(prop.rich_text as NotionRichTextItem[]);
    case "number":
      return prop.number ?? undefined;
    case "checkbox":
      return prop.checkbox;
    case "select":
      return prop.select?.name;
    case "date":
      return prop.date?.start ?? undefined;
    case "url":
      return prop.url ?? undefined;
    case "relation":
      return (prop.relation as NotionRelationItem[])?.map((r) => r.id) || [];
    default:
      return undefined;
  }
}

/**
 * Build Notion properties object for a bank
 */
function buildBankProperties(bank: {
  code: string;
  name: string;
  active: boolean;
  color?: string;
  logoUrl?: string;
  convexId: string;
}): Record<string, NotionPropertyInput> {
  const props: Record<string, NotionPropertyInput> = {
    [NOTION_PROPS.BANK_NAME]: {
      title: [{ text: { content: bank.name } }],
    },
    [NOTION_PROPS.BANK_CODE]: {
      rich_text: [{ text: { content: bank.code } }],
    },
    [NOTION_PROPS.BANK_ACTIVE]: {
      checkbox: bank.active,
    },
    [NOTION_PROPS.BANK_CONVEX_ID]: {
      rich_text: [{ text: { content: bank.convexId } }],
    },
  };

  if (bank.color) {
    props[NOTION_PROPS.BANK_COLOR] = {
      rich_text: [{ text: { content: bank.color } }],
    };
  }

  if (bank.logoUrl) {
    props[NOTION_PROPS.BANK_LOGO_URL] = {
      url: bank.logoUrl,
    };
  }

  return props;
}

/**
 * Build Notion properties object for a transaction
 */
function buildTransactionProperties(txn: {
  txnKey: string;
  date: string;
  amount: number;
  type: "debit" | "credit";
  balance?: number;
  description: string;
  accountId?: string;
  convexId: string;
  bankNotionPageId?: string;
}): Record<string, NotionPropertyInput> {
  const props: Record<string, NotionPropertyInput> = {
    [NOTION_PROPS.TXN_TITLE]: {
      title: [{ text: { content: txn.description.slice(0, 100) } }],
    },
    [NOTION_PROPS.TXN_KEY]: {
      rich_text: [{ text: { content: txn.txnKey } }],
    },
    [NOTION_PROPS.TXN_DATE]: {
      date: { start: txn.date },
    },
    [NOTION_PROPS.TXN_AMOUNT]: {
      number: txn.amount,
    },
    [NOTION_PROPS.TXN_TYPE]: {
      select: { name: txn.type },
    },
    [NOTION_PROPS.TXN_BALANCE]: {
      number: txn.balance ?? 0,
    },
    [NOTION_PROPS.TXN_DESCRIPTION]: {
      rich_text: [{ text: { content: txn.description } }],
    },
    [NOTION_PROPS.TXN_CONVEX_ID]: {
      rich_text: [{ text: { content: txn.convexId } }],
    },
  };

  if (txn.accountId) {
    props[NOTION_PROPS.TXN_ACCOUNT_ID] = {
      rich_text: [{ text: { content: txn.accountId } }],
    };
  }

  if (txn.bankNotionPageId) {
    props[NOTION_PROPS.TXN_BANK] = {
      relation: [{ id: txn.bankNotionPageId }],
    };
  }

  return props;
}

// ============================================================================
// Sync Actions
// ============================================================================

/**
 * Pull changes from Notion to Convex (edits-only)
 * 
 * Fetches pages edited since last pull and updates Convex records.
 * Only updates records that already exist in Convex (edits-only mode).
 */
export const syncNotionPull = internalAction({
  args: {},
  handler: async (ctx): Promise<{ banksPulled: number; transactionsPulled: number; errors: string[] }> => {
    const errors: string[] = [];
    let banksPulled = 0;
    let transactionsPulled = 0;
    
    try {
      const notion = getNotionClient();
      const dbIds = getDatabaseIds();
      
      // Get integration state for last pull timestamps
      const state = await ctx.runMutation(internal.notion_mutations.getOrCreateIntegrationState, {
        name: "notion",
      });
      
      const banksLastPull = state?.banksLastPullMs ?? 0;
      const transactionsLastPull = state?.transactionsLastPullMs ?? 0;
      const pullStartTime = Date.now();
      
      // Pull Banks
      console.log(`[Notion Pull] Fetching banks edited since ${new Date(banksLastPull).toISOString()}`);
      
      const banksFilter = banksLastPull > 0 
        ? {
            timestamp: "last_edited_time" as const,
            last_edited_time: { after: new Date(banksLastPull).toISOString() },
          }
        : undefined;
      
      const banksResponse = await notion.databases.query({
        database_id: dbIds.banks,
        filter: banksFilter,
      });
      
      for (const page of banksResponse.results) {
        if (!("properties" in page)) continue;
        const notionPage = page as NotionPage;
        
        try {
          const convexId = getPropertyValue(notionPage, NOTION_PROPS.BANK_CONVEX_ID);
          if (!convexId) {
            // No Convex ID means this wasn't created from Convex - skip (edits-only)
            continue;
          }
          
          // Get the existing bank
          const existingBank = await ctx.runMutation(internal.notion_mutations.getBankByNotionPageId, {
            notionPageId: notionPage.id,
          });
          
          if (!existingBank) {
            // Try to find by Convex ID
            continue; // Skip if we can't find it
          }
          
          const notionEditedAt = notionDateToMs(notionPage.last_edited_time);
          const convexUpdatedAt = existingBank.updatedAt ?? 0;
          
          // Last-write-wins: only update if Notion is newer
          if (notionEditedAt > convexUpdatedAt) {
            const name = getPropertyValue(notionPage, NOTION_PROPS.BANK_NAME);
            const active = getPropertyValue(notionPage, NOTION_PROPS.BANK_ACTIVE);
            const color = getPropertyValue(notionPage, NOTION_PROPS.BANK_COLOR);
            const logoUrl = getPropertyValue(notionPage, NOTION_PROPS.BANK_LOGO_URL);
            
            await ctx.runMutation(internal.notion_mutations.patchBankNotionData, {
              bankId: existingBank._id,
              notionLastEditedAt: notionEditedAt,
              name: name || undefined,
              active: active !== undefined ? active : undefined,
              color: color || undefined,
              logoUrl: logoUrl || undefined,
            });
            
            banksPulled++;
            console.log(`[Notion Pull] Updated bank: ${existingBank.code}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Bank pull error: ${message}`);
        }
      }
      
      // Pull Transactions
      console.log(`[Notion Pull] Fetching transactions edited since ${new Date(transactionsLastPull).toISOString()}`);
      
      const txnFilter = transactionsLastPull > 0
        ? {
            timestamp: "last_edited_time" as const,
            last_edited_time: { after: new Date(transactionsLastPull).toISOString() },
          }
        : undefined;
      
      const txnResponse = await notion.databases.query({
        database_id: dbIds.transactions,
        filter: txnFilter,
      });
      
      for (const page of txnResponse.results) {
        if (!("properties" in page)) continue;
        const notionPage = page as NotionPage;
        
        try {
          const convexId = getPropertyValue(notionPage, NOTION_PROPS.TXN_CONVEX_ID);
          if (!convexId) {
            // No Convex ID means this wasn't created from Convex - skip (edits-only)
            continue;
          }
          
          const existingTxn = await ctx.runMutation(internal.notion_mutations.getTransactionByNotionPageId, {
            notionPageId: notionPage.id,
          });
          
          if (!existingTxn) {
            continue;
          }
          
          const notionEditedAt = notionDateToMs(notionPage.last_edited_time);
          const convexUpdatedAt = existingTxn.updatedAt ?? 0;
          
          // Last-write-wins: only update if Notion is newer
          if (notionEditedAt > convexUpdatedAt) {
            // Only description is editable from Notion (to protect identity fields)
            const description = getPropertyValue(notionPage, NOTION_PROPS.TXN_DESCRIPTION);
            
            await ctx.runMutation(internal.notion_mutations.patchTransactionNotionData, {
              txnId: existingTxn._id,
              notionLastEditedAt: notionEditedAt,
              description: description || undefined,
            });
            
            transactionsPulled++;
            console.log(`[Notion Pull] Updated transaction: ${existingTxn.txnKey}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Transaction pull error: ${message}`);
        }
      }
      
      // Update integration state with new pull timestamps
      await ctx.runMutation(internal.notion_mutations.updateIntegrationState, {
        name: "notion",
        banksLastPullMs: pullStartTime,
        transactionsLastPullMs: pullStartTime,
        lastRunMs: pullStartTime,
      });
      
      console.log(`[Notion Pull] Complete: ${banksPulled} banks, ${transactionsPulled} transactions updated`);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Pull error: ${message}`);
      console.error(`[Notion Pull] Error: ${message}`);
    }
    
    return { banksPulled, transactionsPulled, errors };
  },
});

/**
 * Push changes from Convex to Notion
 * 
 * Creates pages for new records, updates existing ones.
 */
export const syncNotionPush = internalAction({
  args: {},
  handler: async (ctx): Promise<{ 
    banksCreated: number; 
    banksUpdated: number; 
    transactionsCreated: number; 
    transactionsUpdated: number; 
    errors: string[] 
  }> => {
    const errors: string[] = [];
    let banksCreated = 0;
    let banksUpdated = 0;
    let transactionsCreated = 0;
    let transactionsUpdated = 0;
    
    try {
      const notion = getNotionClient();
      const dbIds = getDatabaseIds();
      const now = Date.now();
      
      // Push Banks
      console.log("[Notion Push] Fetching banks to push...");
      const banksToPush = await ctx.runMutation(internal.notion_mutations.getBanksToPush, {});
      console.log(`[Notion Push] Found ${banksToPush.length} banks to sync`);
      
      for (const bank of banksToPush) {
        try {
          const props = buildBankProperties({
            code: bank.code,
            name: bank.name,
            active: bank.active,
            color: bank.color,
            logoUrl: bank.logoUrl,
            convexId: bank._id,
          });
          
          if (bank.notionPageId) {
            // Update existing page
            const response = await notion.pages.update({
              page_id: bank.notionPageId,
              properties: props,
            });
            
            await ctx.runMutation(internal.notion_mutations.patchBankNotionData, {
              bankId: bank._id,
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });
            
            banksUpdated++;
            console.log(`[Notion Push] Updated bank: ${bank.code}`);
          } else {
            // Create new page
            const response = await notion.pages.create({
              parent: { database_id: dbIds.banks },
              properties: props,
            });
            
            await ctx.runMutation(internal.notion_mutations.patchBankNotionData, {
              bankId: bank._id,
              notionPageId: response.id,
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });
            
            banksCreated++;
            console.log(`[Notion Push] Created bank: ${bank.code}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Bank push error (${bank.code}): ${message}`);
          console.error(`[Notion Push] Bank error (${bank.code}): ${message}`);
        }
      }
      
      // Push Transactions
      console.log("[Notion Push] Fetching transactions to push...");
      const txnsToPush = await ctx.runMutation(internal.notion_mutations.getTransactionsToPush, {
        limit: 100,
      });
      console.log(`[Notion Push] Found ${txnsToPush.length} transactions to sync`);
      
      for (const txn of txnsToPush) {
        try {
          // Get the bank's Notion page ID for the relation
          const bank = await ctx.runMutation(internal.notion_mutations.getBankById, {
            bankId: txn.bankId,
          });
          
          const props = buildTransactionProperties({
            txnKey: txn.txnKey,
            date: txn.date,
            amount: txn.amount,
            type: txn.type,
            balance: txn.balance,
            description: txn.description,
            accountId: txn.accountId,
            convexId: txn._id,
            bankNotionPageId: bank?.notionPageId,
          });
          
          if (txn.notionPageId) {
            // Update existing page
            const response = await notion.pages.update({
              page_id: txn.notionPageId,
              properties: props,
            });
            
            await ctx.runMutation(internal.notion_mutations.patchTransactionNotionData, {
              txnId: txn._id,
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });
            
            transactionsUpdated++;
            console.log(`[Notion Push] Updated transaction: ${txn.txnKey.slice(0, 20)}...`);
          } else {
            // Create new page
            const response = await notion.pages.create({
              parent: { database_id: dbIds.transactions },
              properties: props,
            });
            
            await ctx.runMutation(internal.notion_mutations.patchTransactionNotionData, {
              txnId: txn._id,
              notionPageId: response.id,
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });
            
            transactionsCreated++;
            console.log(`[Notion Push] Created transaction: ${txn.txnKey.slice(0, 20)}...`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Transaction push error (${txn.txnKey.slice(0, 20)}): ${message}`);
          console.error(`[Notion Push] Transaction error: ${message}`);
        }
      }
      
      console.log(`[Notion Push] Complete: Banks ${banksCreated} created, ${banksUpdated} updated; Transactions ${transactionsCreated} created, ${transactionsUpdated} updated`);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Push error: ${message}`);
      console.error(`[Notion Push] Error: ${message}`);
    }
    
    return { banksCreated, banksUpdated, transactionsCreated, transactionsUpdated, errors };
  },
});

/**
 * Full sync: Pull then Push
 * 
 * Orchestrates bidirectional sync by running pull first (to get Notion edits),
 * then push (to send Convex changes to Notion).
 */
export const syncNotionAll = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    console.log(`[Notion Sync] Starting full sync at ${new Date().toISOString()}`);
    
    const result: SyncResult = {
      success: true,
      banksCreated: 0,
      banksUpdated: 0,
      transactionsCreated: 0,
      transactionsUpdated: 0,
      banksPulled: 0,
      transactionsPulled: 0,
      errors: [],
    };
    
    try {
      // Step 1: Pull from Notion (get edits)
      console.log("[Notion Sync] Step 1: Pulling from Notion...");
      const pullResult = await ctx.runAction(internal.notion.syncNotionPull, {});
      result.banksPulled = pullResult.banksPulled;
      result.transactionsPulled = pullResult.transactionsPulled;
      result.errors.push(...pullResult.errors);
      
      // Step 2: Push to Notion (send changes)
      console.log("[Notion Sync] Step 2: Pushing to Notion...");
      const pushResult = await ctx.runAction(internal.notion.syncNotionPush, {});
      result.banksCreated = pushResult.banksCreated;
      result.banksUpdated = pushResult.banksUpdated;
      result.transactionsCreated = pushResult.transactionsCreated;
      result.transactionsUpdated = pushResult.transactionsUpdated;
      result.errors.push(...pushResult.errors);
      
      // Update integration state
      const now = Date.now();
      await ctx.runMutation(internal.notion_mutations.updateIntegrationState, {
        name: "notion",
        lastRunMs: now,
        lastError: result.errors.length > 0 ? result.errors.join("; ") : undefined,
      });
      
      result.success = result.errors.length === 0;
      
      console.log(`[Notion Sync] Complete. Success: ${result.success}, Errors: ${result.errors.length}`);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.success = false;
      result.errors.push(`Sync error: ${message}`);
      console.error(`[Notion Sync] Fatal error: ${message}`);
      
      // Record the error
      await ctx.runMutation(internal.notion_mutations.updateIntegrationState, {
        name: "notion",
        lastRunMs: Date.now(),
        lastError: message,
      });
    }
    
    return result;
  },
});

/**
 * Public action: Manually trigger Notion sync
 * 
 * Can be called from the Convex dashboard or via API.
 * Optionally protected by NOTION_SYNC_SECRET.
 */
export const triggerNotionSync = action({
  args: {
    secret: v.optional(v.string()),
  },
  handler: async (ctx, { secret }): Promise<SyncResult> => {
    // Optional: verify secret
    const expectedSecret = process.env.NOTION_SYNC_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return {
        success: false,
        banksCreated: 0,
        banksUpdated: 0,
        transactionsCreated: 0,
        transactionsUpdated: 0,
        banksPulled: 0,
        transactionsPulled: 0,
        errors: ["Invalid sync secret"],
      };
    }
    
    console.log("[Notion Sync] Manual trigger initiated");
    return await ctx.runAction(internal.notion.syncNotionAll, {});
  },
});
