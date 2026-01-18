/**
 * Notion Movimientos Sync Actions for Convex
 * 
 * Bidirectional sync between Convex transactions and Notion "🔄 Movimientos" database.
 * - Push: Convex → Notion (create/update pages)
 * - Pull: Notion → Convex (edits-only, matched by reference)
 * - Conflict resolution: last-write-wins by timestamp
 * 
 * Required environment variables:
 * - NOTION_API_TOKEN: Notion integration token
 * - NOTION_MOVIMIENTOS_DATABASE_ID: Notion database ID for movimientos
 * - NOTION_SYNC_SECRET: (optional) Secret for manual trigger
 */
"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// ============================================================================
// Notion Property Name Constants (exact Notion property names with accents)
// ============================================================================

/**
 * Property names in Notion "🔄 Movimientos" database.
 * Centralized here for easy renaming.
 */
const NOTION_MOV_PROPS = {
  // Core fields
  NOMBRE: "Nombre",           // Title property (transaction description)
  FECHA: "Fecha",             // Date property
  DEBITO: "Débito",           // Number (debit amount)
  CREDITO: "Crédito",         // Number (credit amount)
  BALANCE: "Balance",         // Number (account balance)
  REFERENCIA: "Referencia",   // Text (bank reference number - primary match key)
  
  // Status and categorization
  ESTADO: "Estado",           // Status (Por conciliar, Conciliando, Por cobrar, Conciliado)
  CUENTA: "Cuenta",           // Select (expense category)
  CATEGORIA: "Categoría",     // Relation to categories
  
  // Relations
  ORIGEN: "Origen",           // Relation (source account)
  DESTINO: "Destino",         // Relation (destination account)
  MOVIMIENTOS_RELACIONADOS: "Movimientos relacionados", // Self-relation
  RELACIONADO_CON: "Relacionado con", // Self-relation
  
  // Other
  ARCHIVOS: "Archivos",       // Files
  TIPO_CAMBIO: "Tipo de cambio", // Number (exchange rate)
} as const;

// ============================================================================
// Types
// ============================================================================

type SyncResult = {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  pulled: number;
  errors: string[];
};

type NotionPage = PageObjectResponse;

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
 * Get Movimientos database ID from environment
 */
function getMovimientosDbId(): string {
  const dbId = process.env.NOTION_MOVIMIENTOS_DATABASE_ID;
  if (!dbId) {
    throw new Error("Missing NOTION_MOVIMIENTOS_DATABASE_ID environment variable");
  }
  return dbId;
}

/**
 * Bank Notion Page IDs mapping
 * These are the pages in the "Carteras" database that represent each bank
 */
const BANK_NOTION_PAGE_IDS: Record<string, string> = {
  banesco: "16db0ba9-7320-80f6-affb-da8ede3cc530",
  bnc: "2d8f7587-c8d0-4612-a1cc-092a60fb4b85", // BNC VES 1109
};

/**
 * Get bank's Notion page ID for Origen/Destino relations
 */
function getBankNotionPageId(bankCode: string): string | undefined {
  return BANK_NOTION_PAGE_IDS[bankCode.toLowerCase()];
}

/**
 * Find existing Notion page by Referencia
 */
async function findNotionPageByReferencia(
  notion: Client,
  dbId: string,
  referencia: string
): Promise<NotionPage | null> {
  try {
    const response = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: NOTION_MOV_PROPS.REFERENCIA,
        rich_text: {
          equals: referencia,
        },
      },
    });

    if (response.results.length > 0 && "properties" in response.results[0]) {
      return response.results[0] as NotionPage;
    }
    return null;
  } catch (err) {
    console.error(`[Movimientos] Error searching for Referencia ${referencia}:`, err);
    return null;
  }
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
function extractRichText(richText: any[]): string {
  return richText?.map((t: any) => t.plain_text).join("") || "";
}

/**
 * Extract property value from Notion page
 */
function getPropertyValue(page: NotionPage, propName: string): any {
  const prop = page.properties[propName];
  if (!prop) return undefined;

  switch (prop.type) {
    case "title":
      return extractRichText(prop.title);
    case "rich_text":
      return extractRichText(prop.rich_text);
    case "number":
      return prop.number;
    case "checkbox":
      return prop.checkbox;
    case "select":
      return prop.select?.name;
    case "status":
      return prop.status?.name;
    case "date":
      return prop.date?.start;
    case "url":
      return prop.url;
    case "relation":
      return prop.relation?.map((r: any) => r.id) || [];
    case "files":
      return prop.files?.map((f: any) => f.file?.url || f.external?.url).filter(Boolean) || [];
    default:
      return undefined;
  }
}

/**
 * Build Notion properties object for a Movimiento (transaction)
 */
function buildMovimientoProperties(txn: {
  description: string;
  date: string;
  amount: number;
  type: "debit" | "credit";
  balance?: number;
  reference?: string;
  // Optional metadata
  cuenta?: string;
  estado?: string;
  tipoCambio?: number;
  origenNotionPageId?: string;
  destinoNotionPageId?: string;
  categoriaNotionPageId?: string;
}): Record<string, any> {
  const props: Record<string, any> = {
    [NOTION_MOV_PROPS.NOMBRE]: {
      title: [{ text: { content: txn.description.slice(0, 2000) } }],
    },
    [NOTION_MOV_PROPS.FECHA]: {
      date: { start: txn.date },
    },
    [NOTION_MOV_PROPS.BALANCE]: {
      number: txn.balance ?? 0,
    },
  };

  // Set Débito or Crédito based on transaction type
  if (txn.type === "debit") {
    props[NOTION_MOV_PROPS.DEBITO] = { number: txn.amount };
    props[NOTION_MOV_PROPS.CREDITO] = { number: 0 };
  } else {
    props[NOTION_MOV_PROPS.CREDITO] = { number: txn.amount };
    props[NOTION_MOV_PROPS.DEBITO] = { number: 0 };
  }

  // Reference (primary matching key)
  if (txn.reference) {
    props[NOTION_MOV_PROPS.REFERENCIA] = {
      rich_text: [{ text: { content: txn.reference } }],
    };
  }

  // Optional metadata
  if (txn.cuenta) {
    props[NOTION_MOV_PROPS.CUENTA] = {
      select: { name: txn.cuenta },
    };
  }

  if (txn.estado) {
    props[NOTION_MOV_PROPS.ESTADO] = {
      status: { name: txn.estado },
    };
  }

  if (txn.tipoCambio !== undefined) {
    props[NOTION_MOV_PROPS.TIPO_CAMBIO] = {
      number: txn.tipoCambio,
    };
  }

  // Relations
  if (txn.origenNotionPageId) {
    props[NOTION_MOV_PROPS.ORIGEN] = {
      relation: [{ id: txn.origenNotionPageId }],
    };
  }

  if (txn.destinoNotionPageId) {
    props[NOTION_MOV_PROPS.DESTINO] = {
      relation: [{ id: txn.destinoNotionPageId }],
    };
  }

  if (txn.categoriaNotionPageId) {
    props[NOTION_MOV_PROPS.CATEGORIA] = {
      relation: [{ id: txn.categoriaNotionPageId }],
    };
  }

  return props;
}

// ============================================================================
// Sync Actions
// ============================================================================

/**
 * Pull changes from Notion to Convex (edits-only, matched by reference)
 */
export const syncMovimientosPull = internalAction({
  args: {
    bankCode: v.optional(v.string()),
  },
  handler: async (ctx, { bankCode = "banesco" }): Promise<{ pulled: number; errors: string[] }> => {
    const errors: string[] = [];
    let pulled = 0;

    try {
      const notion = getNotionClient();
      const dbId = getMovimientosDbId();

      // Get integration state for last pull timestamp
      const state = await ctx.runMutation(internal.notion_movimientos_mutations.getOrCreateMovimientosState, {});
      const lastPull = state?.transactionsLastPullMs ?? 0;
      const pullStartTime = Date.now();

      console.log(`[Movimientos Pull] Fetching pages edited since ${new Date(lastPull).toISOString()}`);

      // Query Notion for pages edited since last pull
      const filter = lastPull > 0
        ? {
            timestamp: "last_edited_time" as const,
            last_edited_time: { after: new Date(lastPull).toISOString() },
          }
        : undefined;

      const response = await notion.databases.query({
        database_id: dbId,
        filter,
      });

      for (const page of response.results) {
        if (!("properties" in page)) continue;
        const notionPage = page as NotionPage;

        try {
          // Extract reference from Notion page
          const reference = getPropertyValue(notionPage, NOTION_MOV_PROPS.REFERENCIA);
          
          if (!reference) {
            // No reference means we can't reliably match - try by Notion page ID
            const existingByPageId = await ctx.runMutation(
              internal.notion_movimientos_mutations.getTransactionByNotionPageId,
              { notionPageId: notionPage.id }
            );
            
            if (!existingByPageId) {
              console.log(`[Movimientos Pull] Skipping page without reference: ${notionPage.id}`);
              continue;
            }
          }

          // Try to find matching transaction
          let existingTxn = null;
          
          if (reference) {
            existingTxn = await ctx.runMutation(
              internal.notion_movimientos_mutations.getTransactionByReference,
              { bankCode, reference }
            );
          }
          
          if (!existingTxn) {
            // Fallback to Notion page ID lookup
            existingTxn = await ctx.runMutation(
              internal.notion_movimientos_mutations.getTransactionByNotionPageId,
              { notionPageId: notionPage.id }
            );
          }

          if (!existingTxn) {
            // No matching transaction in Convex - skip (edits-only mode)
            console.log(`[Movimientos Pull] No matching Convex transaction for reference: ${reference}`);
            continue;
          }

          const notionEditedAt = notionDateToMs(notionPage.last_edited_time);
          const convexUpdatedAt = existingTxn.updatedAt ?? 0;

          // Last-write-wins: only update if Notion is newer
          if (notionEditedAt > convexUpdatedAt) {
            // Only description (Nombre) is safely editable from Notion
            const description = getPropertyValue(notionPage, NOTION_MOV_PROPS.NOMBRE);

            await ctx.runMutation(internal.notion_movimientos_mutations.patchTransactionMovimientosData, {
              txnId: existingTxn._id,
              notionPageId: notionPage.id,
              notionLastEditedAt: notionEditedAt,
              description: description || undefined,
            });

            pulled++;
            console.log(`[Movimientos Pull] Updated transaction: ${reference || notionPage.id}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Pull error for page ${notionPage.id}: ${message}`);
        }
      }

      // Update integration state with new pull timestamp
      await ctx.runMutation(internal.notion_movimientos_mutations.updateMovimientosState, {
        lastPullMs: pullStartTime,
        lastRunMs: pullStartTime,
      });

      console.log(`[Movimientos Pull] Complete: ${pulled} transactions updated`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Pull error: ${message}`);
      console.error(`[Movimientos Pull] Error: ${message}`);
    }

    return { pulled, errors };
  },
});

/**
 * Push changes from Convex to Notion Movimientos
 */
export const syncMovimientosPush = internalAction({
  args: {},
  handler: async (ctx): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> => {
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      const notion = getNotionClient();
      const dbId = getMovimientosDbId();
      const now = Date.now();

      console.log("[Movimientos Push] Fetching transactions to push...");
      const txnsToPush = await ctx.runMutation(
        internal.notion_movimientos_mutations.getTransactionsToPushMovimientos,
        { limit: 100 }
      );
      console.log(`[Movimientos Push] Found ${txnsToPush.length} transactions to sync`);

      for (const txn of txnsToPush) {
        try {
          // Get the bank's Notion page ID for Origen/Destino
          const bankCode = txn.bankCode || "banesco";
          const bankNotionPageId = getBankNotionPageId(bankCode);

          // Build properties with Origen/Destino based on transaction type
          // - Debit (money going out): Origen = bank
          // - Credit (money coming in): Destino = bank
          const props = buildMovimientoProperties({
            description: txn.description,
            date: txn.date,
            amount: txn.amount,
            type: txn.type,
            balance: txn.balance,
            reference: txn.reference,
            origenNotionPageId: txn.type === "debit" ? bankNotionPageId : undefined,
            destinoNotionPageId: txn.type === "credit" ? bankNotionPageId : undefined,
          });

          // First, check if we already have a notionPageId stored
          let existingPageId = txn.notionPageId;

          // If no stored page ID, check Notion by Referencia
          if (!existingPageId && txn.reference) {
            const existingPage = await findNotionPageByReferencia(notion, dbId, txn.reference);
            if (existingPage) {
              existingPageId = existingPage.id;
              console.log(`[Movimientos Push] Found existing page by Referencia: ${txn.reference}`);
            }
          }

          if (existingPageId) {
            // Update existing page
            const response = await notion.pages.update({
              page_id: existingPageId,
              properties: props,
            });

            await ctx.runMutation(internal.notion_movimientos_mutations.patchTransactionMovimientosData, {
              txnId: txn._id,
              notionPageId: existingPageId, // Store the page ID if we found it by reference
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });

            updated++;
            console.log(`[Movimientos Push] Updated: ${txn.reference || txn.txnKey.slice(0, 20)}...`);
          } else if (txn.reference) {
            // Only create new page if we have a reference
            const response = await notion.pages.create({
              parent: { database_id: dbId },
              properties: props,
            });

            await ctx.runMutation(internal.notion_movimientos_mutations.patchTransactionMovimientosData, {
              txnId: txn._id,
              notionPageId: response.id,
              notionLastSyncedAt: now,
              notionLastEditedAt: notionDateToMs((response as NotionPage).last_edited_time),
            });

            created++;
            console.log(`[Movimientos Push] Created: ${txn.reference}...`);
          } else {
            // Skip transactions without reference
            skipped++;
            console.log(`[Movimientos Push] Skipped (no reference): ${txn.txnKey.slice(0, 20)}...`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const ref = txn.reference || txn.txnKey.slice(0, 20);
          errors.push(`Push error (${ref}): ${message}`);
          console.error(`[Movimientos Push] Error for ${ref}: ${message}`);
        }
      }

      console.log(`[Movimientos Push] Complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Push error: ${message}`);
      console.error(`[Movimientos Push] Error: ${message}`);
    }

    return { created, updated, skipped, errors };
  },
});

/**
 * Full sync: Pull then Push
 */
export const syncMovimientosAll = internalAction({
  args: {
    bankCode: v.optional(v.string()),
  },
  handler: async (ctx, { bankCode }): Promise<SyncResult> => {
    console.log(`[Movimientos Sync] Starting full sync at ${new Date().toISOString()}`);

    const result: SyncResult = {
      success: true,
      created: 0,
      updated: 0,
      skipped: 0,
      pulled: 0,
      errors: [],
    };

    try {
      // Step 1: Pull from Notion (get edits)
      console.log("[Movimientos Sync] Step 1: Pulling from Notion...");
      const pullResult = await ctx.runAction(internal.notion_movimientos.syncMovimientosPull, {
        bankCode,
      });
      result.pulled = pullResult.pulled;
      result.errors.push(...pullResult.errors);

      // Step 2: Push to Notion (send changes)
      console.log("[Movimientos Sync] Step 2: Pushing to Notion...");
      const pushResult = await ctx.runAction(internal.notion_movimientos.syncMovimientosPush, {});
      result.created = pushResult.created;
      result.updated = pushResult.updated;
      result.skipped = pushResult.skipped;
      result.errors.push(...pushResult.errors);

      // Update integration state
      const now = Date.now();
      await ctx.runMutation(internal.notion_movimientos_mutations.updateMovimientosState, {
        lastRunMs: now,
        lastError: result.errors.length > 0 ? result.errors.join("; ") : undefined,
      });

      result.success = result.errors.length === 0;

      console.log(`[Movimientos Sync] Complete. Success: ${result.success}, Errors: ${result.errors.length}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.success = false;
      result.errors.push(`Sync error: ${message}`);
      console.error(`[Movimientos Sync] Fatal error: ${message}`);

      // Record the error
      await ctx.runMutation(internal.notion_movimientos_mutations.updateMovimientosState, {
        lastRunMs: Date.now(),
        lastError: message,
      });
    }

    return result;
  },
});

/**
 * Public action: Manually trigger Movimientos sync
 */
export const triggerMovimientosSync = action({
  args: {
    secret: v.optional(v.string()),
    bankCode: v.optional(v.string()),
  },
  handler: async (ctx, { secret, bankCode }): Promise<SyncResult> => {
    // Optional: verify secret
    const expectedSecret = process.env.NOTION_SYNC_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return {
        success: false,
        created: 0,
        updated: 0,
        skipped: 0,
        pulled: 0,
        errors: ["Invalid sync secret"],
      };
    }

    console.log("[Movimientos Sync] Manual trigger initiated");
    return await ctx.runAction(internal.notion_movimientos.syncMovimientosAll, {
      bankCode,
    });
  },
});
