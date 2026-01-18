/**
 * Convex Sync Action for Bank Transaction Fetching via Browserbase
 * 
 * Copy this file to your Convex project's convex/ directory.
 * 
 * This action:
 * 1. Connects to Browserbase's remote browser via Playwright
 * 2. Runs Banesco scraping using your SDK's logic
 * 3. Ingests new transactions into Convex
 * 
 * IMPORTANT: This uses "use node" to access Node.js APIs.
 * Make sure to add playwright and @browserbasehq/sdk as external deps.
 */
"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import Browserbase from "@browserbasehq/sdk";
import { chromium, type Page } from "playwright-core";
import { createHash } from "crypto";

/**
 * Environment variables needed (set in Convex dashboard):
 * - BROWSERBASE_API_KEY: Your Browserbase API key
 * - BROWSERBASE_PROJECT_ID: Your Browserbase project ID
 * - BANESCO_USERNAME: Banesco login username (e.g., V12345678)
 * - BANESCO_PASSWORD: Banesco login password
 * - BANESCO_SECURITY_QUESTIONS: Security Q&A pairs (e.g., "anime:Naruto,mascota:Firulais")
 */

interface BanescoTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

/**
 * Parse security questions from env format
 */
function parseSecurityQuestions(raw: string): Map<string, string> {
  const questions = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [keyword, answer] = pair.split(":");
    if (keyword && answer) {
      questions.set(keyword.toLowerCase().trim(), answer.trim());
    }
  }
  return questions;
}

/**
 * Generate deterministic transaction ID
 */
function generateTxnId(date: string, amount: number, description: string, type: string): string {
  const key = [date, String(Math.abs(amount)), description.trim(), type].join("|");
  return `banesco-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

/**
 * Scrape Banesco transactions using Playwright connected to Browserbase
 */
async function scrapeBanescoViaBrowserbase(): Promise<BanescoTransaction[]> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  const username = process.env.BANESCO_USERNAME;
  const password = process.env.BANESCO_PASSWORD;
  const securityQuestionsRaw = process.env.BANESCO_SECURITY_QUESTIONS;

  if (!apiKey || !projectId) {
    throw new Error("Missing BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID");
  }
  if (!username || !password || !securityQuestionsRaw) {
    throw new Error("Missing Banesco credentials (BANESCO_USERNAME, BANESCO_PASSWORD, BANESCO_SECURITY_QUESTIONS)");
  }

  const securityAnswers = parseSecurityQuestions(securityQuestionsRaw);
  console.log(`[Sync] Starting Browserbase session...`);

  // Create Browserbase session
  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({ projectId });
  
  console.log(`[Sync] Session created: ${session.id}`);

  let browser;
  let transactions: BanescoTransaction[] = [];

  try {
    // Connect Playwright to remote browser
    browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log(`[Sync] Connected to remote browser, navigating to Banesco...`);

    // Navigate to Banesco login
    await page.goto("https://www.banesconline.com/mantis/Website/Login.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for login iframe and switch to it
    const iframeElement = await page.waitForSelector("iframe#ctl00_cp_frmAplicacion", {
      timeout: 30000,
    });
    const frame = await iframeElement.contentFrame();
    if (!frame) {
      throw new Error("Could not access login iframe");
    }

    console.log(`[Sync] In login iframe, filling credentials...`);

    // Fill login form
    await frame.fill('input[name*="txtUsuario"], input[id*="txtUsuario"]', username);
    await frame.fill('input[name*="txtClave"], input[id*="txtClave"], input[type="password"]', password);

    // Click login button
    await frame.click('input[type="submit"], button[type="submit"], input[value*="Aceptar"], input[value*="Entrar"]');

    // Wait for security questions or main page
    await page.waitForTimeout(3000);

    // Handle security questions if present
    const pageContent = await page.content();
    if (pageContent.toLowerCase().includes("pregunta") || pageContent.toLowerCase().includes("seguridad")) {
      console.log(`[Sync] Security questions detected, answering...`);
      
      // Find question labels and answer fields
      const questionLabels = await page.$$eval("label, td, span", (elements) => 
        elements.map(el => el.textContent?.toLowerCase().trim() || "")
      );

      for (const [keyword, answer] of securityAnswers) {
        for (const label of questionLabels) {
          if (label.includes(keyword)) {
            // Find nearby input and fill
            const inputs = await page.$$('input[type="text"], input[type="password"]');
            for (const input of inputs) {
              const isVisible = await input.isVisible();
              const value = await input.inputValue();
              if (isVisible && !value) {
                await input.fill(answer);
                break;
              }
            }
          }
        }
      }

      // Submit security answers
      await page.click('input[type="submit"], button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    console.log(`[Sync] Logged in, navigating to transactions...`);

    // Navigate to movements/transactions page
    // This varies by account type, try common patterns
    const movementsLink = await page.$('a:has-text("Movimientos"), a:has-text("movimientos"), a:has-text("Estado de Cuenta")');
    if (movementsLink) {
      await movementsLink.click();
      await page.waitForTimeout(2000);
    }

    // Extract transactions from tables
    transactions = await extractTransactionsFromPage(page);

    console.log(`[Sync] Extracted ${transactions.length} transactions`);

  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
  }

  return transactions;
}

/**
 * Extract transactions from the current page
 */
async function extractTransactionsFromPage(page: Page): Promise<BanescoTransaction[]> {
  const transactions: BanescoTransaction[] = [];

  // Find all tables that might contain transaction data
  const tables = await page.$$("table");

  for (const table of tables) {
    const rows = await table.$$("tr");
    
    for (const row of rows) {
      const cells = await row.$$("td");
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(cell => cell.textContent().then(t => t?.trim() || ""))
      );

      // Try to find date, amount, description patterns
      const dateMatch = cellTexts.find(t => /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(t));
      const amountMatch = cellTexts.find(t => /[\d.,]+/.test(t) && (t.includes(",") || t.includes(".")));
      const description = cellTexts.find(t => 
        t.length > 10 && 
        !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(t) &&
        !/^[\d.,]+$/.test(t)
      );

      if (!dateMatch || !amountMatch) continue;

      // Determine debit/credit from D/C column or amount sign
      const dcCell = cellTexts.find(t => /^[DC]$/i.test(t));
      const type: "debit" | "credit" = dcCell?.toUpperCase() === "D" ? "debit" : "credit";

      // Parse amount (Venezuelan format: 1.234,56)
      const cleanAmount = amountMatch.replace(/\./g, "").replace(",", ".");
      const amount = Math.abs(parseFloat(cleanAmount) || 0);

      if (amount === 0) continue;

      const id = generateTxnId(dateMatch, amount, description || "", type);

      transactions.push({
        id,
        date: dateMatch,
        description: description || "Transacción",
        amount,
        type,
      });
    }
  }

  return transactions;
}

// Result type for sync operations
type SyncResult = {
  success: boolean;
  fetchedCount?: number;
  insertedCount?: number;
  skippedDuplicates?: number;
  error?: string;
};

/**
 * Internal action: Sync Banesco transactions daily
 * 
 * Called by the cron job. Connects to Browserbase, scrapes transactions,
 * and ingests them into Convex.
 */
export const syncBanescoDaily = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    console.log(`[Sync] Starting Banesco transaction sync at ${new Date().toISOString()}`);

    try {
      // Scrape transactions via Browserbase
      const transactions = await scrapeBanescoViaBrowserbase();

      if (transactions.length === 0) {
        console.log(`[Sync] No transactions found`);
        return { success: true, fetchedCount: 0, insertedCount: 0 };
      }

      // Normalize for Convex ingestion
      const normalizedTxs = transactions.map((tx) => ({
        bank: "banesco" as const,
        txnKey: tx.id,
        date: tx.date,
        amount: tx.amount,
        description: tx.description,
        type: tx.type,
        raw: tx,
      }));

      // Ingest into Convex
      const ingestResult = (await ctx.runMutation(internal.transactions.ingestTransactions, {
        transactions: normalizedTxs,
      })) as { insertedCount: number; skippedDuplicates: number };

      console.log(`[Sync] Complete: ${ingestResult.insertedCount} new, ${ingestResult.skippedDuplicates} duplicates`);

      return {
        success: true,
        fetchedCount: transactions.length,
        insertedCount: ingestResult.insertedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
      };

    } catch (error) {
      console.error(`[Sync] Sync failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Public action: Manually trigger sync
 * 
 * Useful for testing or manual refreshes.
 */
export const triggerSync = action({
  args: {
    secret: v.optional(v.string()),
  },
  handler: async (ctx, { secret }): Promise<SyncResult> => {
    // Optional: verify a manual trigger secret
    const expectedSecret = process.env.MANUAL_SYNC_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return { success: false, error: "Unauthorized" };
    }

    // Run the internal sync action
    return (await ctx.runAction(internal.sync.syncBanescoDaily, {})) as SyncResult;
  },
});
