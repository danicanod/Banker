/**
 * BNC Sync Script
 *
 * Syncs BNC transactions to Convex using pure HTTP (no browser needed).
 *
 * Usage:
 *   npx tsx scripts/bnc-sync.ts
 *
 * Environment:
 *   - CONVEX_URL: Convex deployment URL
 *   - BNC_ID: BNC user ID (cedula with V prefix)
 *   - BNC_CARD: BNC card number (16 digits)
 *   - BNC_PASSWORD: BNC password
 *   - BNC_DEBUG=true: Enable verbose HTTP client logging
 *   - SYNC_VERBOSE=true: Show all logs (default: minimal)
 *   - SYNC_PREVIEW_LIMIT=N: Number of transactions to preview (default: 5)
 */

import {
  loadEnv,
  requireEnv,
  enableConsoleFilter,
  disableConsoleFilter,
  log,
  printPreview,
  ingestToConvex,
} from "./_sync-utils.js";

import { createBncHttpClient, type BncTransaction } from "@danicanod/banker-scrapers-ve";

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // Load environment
  loadEnv();

  const { CONVEX_URL, BNC_ID, BNC_CARD, BNC_PASSWORD } = requireEnv<{
    CONVEX_URL: string;
    BNC_ID: string;
    BNC_CARD: string;
    BNC_PASSWORD: string;
  }>(["CONVEX_URL", "BNC_ID", "BNC_CARD", "BNC_PASSWORD"]);

  const credentials = {
    id: BNC_ID,
    card: BNC_CARD,
    password: BNC_PASSWORD,
  };

  const debug = process.env.BNC_DEBUG === "true";

  // Step 1: Login via HTTP
  log("🔐 Logging into BNC...");
  enableConsoleFilter();

  const client = createBncHttpClient(credentials, {
    debug,
    logoutFirst: true,
  });

  const loginResult = await client.login();
  disableConsoleFilter();

  if (!loginResult.success) {
    throw new Error(`Login failed: ${loginResult.error || loginResult.message}`);
  }

  log("✅ Login successful\n");

  // Step 2: Fetch transactions
  log("📊 Fetching Last25 transactions...");
  enableConsoleFilter();

  const scrapingResult = await client.fetchLast25Transactions();
  disableConsoleFilter();

  if (!scrapingResult.success) {
    throw new Error(`Scraping failed: ${scrapingResult.error || scrapingResult.message}`);
  }

  const transactions = scrapingResult.data;
  const accountCount = scrapingResult.accountsFound || 0;

  log(`✅ Found ${transactions.length} transactions from ${accountCount} account(s)\n`);

  if (transactions.length === 0) {
    log("⚠️  No transactions found.");
    return;
  }

  // Show preview
  printPreview(transactions);

  // Step 3: Normalize and push to Convex
  log("📤 Pushing to Convex...");

  const normalizedTxs = transactions.map((tx: BncTransaction) => ({
    bank: "bnc" as const,
    txnKey: tx.id, // Already deterministic hash from BNC client
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
    type: tx.type,
    accountId: tx.accountName,
    raw: tx,
  }));

  const result = await ingestToConvex(CONVEX_URL, normalizedTxs);

  log(`\n✅ Done!`);
  log(`   New: ${result.insertedCount} | Skipped: ${result.skippedDuplicates}`);
}

// ============================================================================
// Entry Point
// ============================================================================

log("🚀 Starting BNC sync (pure HTTP)...\n");

main().catch((err) => {
  disableConsoleFilter();
  log(`💥 Failed: ${err.message}`);
  process.exit(1);
});
