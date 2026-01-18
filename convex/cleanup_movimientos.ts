/**
 * Cleanup Movimientos - Delete Banesco Convex transactions missing reference
 *
 * SAFETY: Only archives Notion pages that are directly linked via transactions.notionPageId.
 * Never queries Notion for pages with empty Referencia - we ONLY use the stored page IDs.
 *
 * Eligibility criteria (ALL must be true):
 * - bankCode == "banesco"
 * - reference is missing/empty
 * - notionPageId is present
 *
 * Before archiving, we double-check that the Notion page's "Referencia" is still empty.
 * If it has a value, we skip (do not archive, do not delete).
 */
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// ============================================================================
// Types
// ============================================================================

type CleanupResult = {
  success: boolean;
  dryRun: boolean;
  processed: number;
  archived: number;
  deleted: number;
  skipped: number;
  errors: string[];
  details: Array<{
    txnId: string;
    notionPageId: string;
    description: string;
    action: "archived" | "skipped" | "error";
    reason?: string;
  }>;
};

/** Notion rich text element structure */
interface NotionRichTextItem {
  plain_text: string;
}

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
 * Extract text from Notion rich text array
 */
function extractRichText(richText: NotionRichTextItem[] | undefined): string {
  return richText?.map((t) => t.plain_text).join("") || "";
}

/**
 * Fetch a Notion page and check if its Referencia is empty
 * Returns: { exists: boolean, referenciaEmpty: boolean, page?: PageObjectResponse }
 */
async function fetchNotionPageAndCheckReferencia(
  notion: Client,
  pageId: string
): Promise<{ exists: boolean; referenciaEmpty: boolean; page?: PageObjectResponse }> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!("properties" in page)) {
      // Partial response - shouldn't happen with standard retrieve
      return { exists: true, referenciaEmpty: false };
    }

    const fullPage = page as PageObjectResponse;
    const referenciaProp = fullPage.properties["Referencia"];

    if (!referenciaProp || referenciaProp.type !== "rich_text") {
      // Property doesn't exist or wrong type - consider it empty
      return { exists: true, referenciaEmpty: true, page: fullPage };
    }

    const referenciaValue = extractRichText(
      referenciaProp.rich_text as NotionRichTextItem[]
    );

    return {
      exists: true,
      referenciaEmpty: !referenciaValue || referenciaValue.trim() === "",
      page: fullPage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Page not found or already archived
    if (message.includes("Could not find") || message.includes("archived")) {
      return { exists: false, referenciaEmpty: false };
    }

    throw err;
  }
}

/**
 * Archive a Notion page
 */
async function archiveNotionPage(notion: Client, pageId: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
}

// ============================================================================
// Cleanup Action
// ============================================================================

/**
 * Cleanup Banesco transactions missing reference.
 *
 * For each eligible transaction:
 * 1. Fetch the Notion page by notionPageId
 * 2. Check if "Referencia" is empty
 * 3. If empty: archive the page, delete events, delete transaction
 * 4. If not empty: skip (user may have manually added a reference)
 *
 * Requires NOTION_SYNC_SECRET for authorization.
 *
 * Usage:
 *   npx convex run cleanup_movimientos:cleanupBanescoMissingReferencia \
 *     '{"secret":"YOUR_SECRET","dryRun":true,"limit":100}'
 *
 * @param secret - Required sync secret for authorization
 * @param dryRun - If true, only report what would be done (default: true)
 * @param limit - Maximum number of transactions to process (default: 100)
 */
export const cleanupBanescoMissingReferencia = action({
  args: {
    secret: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { secret, dryRun = true, limit = 100 }): Promise<CleanupResult> => {
    // Validate secret
    const expectedSecret = process.env.NOTION_SYNC_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return {
        success: false,
        dryRun,
        processed: 0,
        archived: 0,
        deleted: 0,
        skipped: 0,
        errors: ["Invalid or missing sync secret"],
        details: [],
      };
    }

    const result: CleanupResult = {
      success: true,
      dryRun,
      processed: 0,
      archived: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    console.log(
      `[Cleanup] Starting ${dryRun ? "DRY RUN" : "EXECUTION"} - ` +
        `cleaning Banesco transactions without reference (limit: ${limit})`
    );

    try {
      const notion = getNotionClient();

      // Step 1: Get eligible transactions from Convex
      const eligibleTxns = await ctx.runMutation(
        internal.notion_movimientos_mutations.listEligibleCleanupTransactions,
        { bankCode: "banesco", limit }
      );

      console.log(`[Cleanup] Found ${eligibleTxns.length} eligible transactions`);

      // Step 2: Process each transaction
      for (const txn of eligibleTxns) {
        result.processed++;

        // TypeScript guard: we filtered for notionPageId in the mutation,
        // but TS doesn't know that. Skip if somehow missing.
        const notionPageId = txn.notionPageId;
        if (!notionPageId) {
          console.warn(`[Cleanup] Skipping txn without notionPageId: ${txn._id}`);
          continue;
        }

        try {
          // Fetch the Notion page and check Referencia
          const { exists, referenciaEmpty } = await fetchNotionPageAndCheckReferencia(
            notion,
            notionPageId
          );

          if (!exists) {
            // Page already archived or deleted
            console.log(
              `[Cleanup] Page not found/archived: ${notionPageId} (${txn.description.slice(0, 30)}...)`
            );

            if (!dryRun) {
              // Still delete the Convex records
              await ctx.runMutation(
                internal.notion_movimientos_mutations.deleteTransactionAndEvents,
                { txnId: txn._id }
              );
              result.deleted++;
            }

            result.details.push({
              txnId: txn._id,
              notionPageId,
              description: txn.description,
              action: "archived",
              reason: "Notion page already archived/deleted",
            });
            result.archived++;
            continue;
          }

          if (!referenciaEmpty) {
            // Referencia has a value - skip this transaction
            console.log(
              `[Cleanup] Skipping (Referencia not empty): ${notionPageId} (${txn.description.slice(0, 30)}...)`
            );

            result.details.push({
              txnId: txn._id,
              notionPageId,
              description: txn.description,
              action: "skipped",
              reason: "Notion page has non-empty Referencia",
            });
            result.skipped++;
            continue;
          }

          // Referencia is empty - archive the page and delete Convex records
          console.log(
            `[Cleanup] ${dryRun ? "Would archive" : "Archiving"}: ${notionPageId} (${txn.description.slice(0, 30)}...)`
          );

          if (!dryRun) {
            // Archive the Notion page
            await archiveNotionPage(notion, notionPageId);

            // Delete the Convex transaction and related events
            await ctx.runMutation(
              internal.notion_movimientos_mutations.deleteTransactionAndEvents,
              { txnId: txn._id }
            );
            result.deleted++;
          }

          result.details.push({
            txnId: txn._id,
            notionPageId,
            description: txn.description,
            action: "archived",
          });
          result.archived++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[Cleanup] Error processing ${txn._id}: ${message}`);

          result.errors.push(`${txn._id}: ${message}`);
          result.details.push({
            txnId: txn._id,
            notionPageId,
            description: txn.description,
            action: "error",
            reason: message,
          });
        }
      }

      result.success = result.errors.length === 0;

      console.log(
        `[Cleanup] ${dryRun ? "DRY RUN" : "EXECUTION"} complete. ` +
          `Processed: ${result.processed}, Archived: ${result.archived}, ` +
          `Skipped: ${result.skipped}, Deleted: ${result.deleted}, ` +
          `Errors: ${result.errors.length}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.success = false;
      result.errors.push(`Fatal error: ${message}`);
      console.error(`[Cleanup] Fatal error: ${message}`);
    }

    return result;
  },
});
