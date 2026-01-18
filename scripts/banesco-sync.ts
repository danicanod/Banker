/**
 * Banesco Sync Script
 *
 * Syncs Banesco transactions to Convex using BanescoClient (hybrid approach):
 * - Playwright for login (handles JS/iframes/security questions)
 * - HTTP for fetching transactions (faster, more stable)
 *
 * Usage:
 *   npx tsx scripts/banesco-sync.ts
 *
 * Environment:
 *   - CONVEX_URL: Convex deployment URL
 *   - BANESCO_USERNAME, BANESCO_PASSWORD, BANESCO_SECURITY_QUESTIONS
 *   - SYNC_VERBOSE=true: Show all logs (default: minimal)
 *   - SYNC_PREVIEW_LIMIT=N: Number of transactions to preview (default: 5)
 */

import {
  loadEnv,
  requireEnv,
  enableConsoleFilter,
  disableConsoleFilter,
  log,
  makeTxnKey,
  printPreview,
  ingestToConvex,
} from "./_sync-utils.js";

import { createBanescoClient } from "../src/banks/banesco/client.js";

// ============================================================================
// Types
// ============================================================================

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  balance: number;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // Load environment
  loadEnv();

  const { CONVEX_URL, BANESCO_USERNAME, BANESCO_PASSWORD, BANESCO_SECURITY_QUESTIONS } =
    requireEnv<{
      CONVEX_URL: string;
      BANESCO_USERNAME: string;
      BANESCO_PASSWORD: string;
      BANESCO_SECURITY_QUESTIONS: string;
    }>(["CONVEX_URL", "BANESCO_USERNAME", "BANESCO_PASSWORD", "BANESCO_SECURITY_QUESTIONS"]);

  const SYNC_VERBOSE = process.env.SYNC_VERBOSE === "true";
  const useHeadless = process.env.BANESCO_HEADLESS !== "false";

  // Create client
  const client = createBanescoClient(
    {
      username: BANESCO_USERNAME,
      password: BANESCO_PASSWORD,
      securityQuestions: BANESCO_SECURITY_QUESTIONS,
    },
    {
      headless: useHeadless,
      timeout: 60000,
      debug: SYNC_VERBOSE,
    }
  );

  try {
    // =========================================================================
    // Step 1: Login (Playwright handles JS, iframes, security questions)
    // =========================================================================
    log("🔐 Logging into Banesco...");
    if (!SYNC_VERBOSE) enableConsoleFilter();

    const loginResult = await client.login();
    disableConsoleFilter();

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.message}`);
    }

    log(`✅ Login successful (${loginResult.cookieCount} cookies)\n`);

    // =========================================================================
    // Step 2: Fetch accounts (HTTP)
    // =========================================================================
    log("📊 Fetching accounts...");
    if (!SYNC_VERBOSE) enableConsoleFilter();

    const accountsResult = await client.getAccounts();
    disableConsoleFilter();

    if (!accountsResult.success || accountsResult.accounts.length === 0) {
      log("⚠️  Could not fetch accounts");
      if (accountsResult.error) {
        log(`   Error: ${accountsResult.error}`);
      }
    }

    const allTransactions: Transaction[] = [];

    if (accountsResult.success && accountsResult.accounts.length > 0) {
      log(`📋 Found ${accountsResult.accounts.length} account(s):`);
      for (const account of accountsResult.accounts) {
        log(`   - ${account.type}: ${account.accountNumber} (${account.currency} ${account.balance.toLocaleString()})`);
      }
      log("");

      // =========================================================================
      // Step 3: Fetch movements for each account (HTTP)
      // =========================================================================
      for (const account of accountsResult.accounts) {
        log(`📥 Fetching movements for ${account.accountNumber}...`);
        if (!SYNC_VERBOSE) enableConsoleFilter();

        const movementsResult = await client.getAccountMovements(account.accountNumber);
        disableConsoleFilter();

        if (movementsResult.success && movementsResult.transactions.length > 0) {
          for (const tx of movementsResult.transactions) {
            allTransactions.push({
              id: makeTxnKey("banesco", {
                date: tx.date,
                description: tx.description,
                amount: tx.amount,
                type: tx.type,
              }),
              date: tx.date || new Date().toISOString().split("T")[0],
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
              balance: tx.balance || 0,
            });
          }
          log(`   ✅ ${movementsResult.transactions.length} transactions\n`);
        } else {
          log(`   ⚠️  No transactions found`);
          if (movementsResult.error) {
            log(`   Error: ${movementsResult.error}`);
          }
          log("");
        }
      }
    } else {
      // Fallback: Try direct transaction fetch
      log("📥 Trying direct transaction fetch...");
      if (!SYNC_VERBOSE) enableConsoleFilter();

      const txResult = await client.getTransactions();
      disableConsoleFilter();

      if (txResult.success && txResult.transactions.length > 0) {
        for (const tx of txResult.transactions) {
          allTransactions.push({
            id: makeTxnKey("banesco", {
              date: tx.date,
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
            }),
            date: tx.date || new Date().toISOString().split("T")[0],
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            balance: tx.balance || 0,
          });
        }
      }
    }

    log(`✅ Found ${allTransactions.length} transactions\n`);

    if (allTransactions.length === 0) {
      log("⚠️  No transactions found.");
      return;
    }

    // Show preview
    printPreview(allTransactions);

    // =========================================================================
    // Step 4: Push to Convex
    // =========================================================================
    log("📤 Pushing to Convex...");

    const normalizedTxs = allTransactions.map((tx) => ({
      bank: "banesco" as const,
      txnKey: tx.id,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      type: tx.type,
      balance: tx.balance,
      raw: tx,
    }));

    const result = await ingestToConvex(CONVEX_URL, normalizedTxs);

    log(`\n✅ Done!`);
    log(`   New: ${result.insertedCount} | Skipped: ${result.skippedDuplicates}`);
  } finally {
    disableConsoleFilter();
    if (!SYNC_VERBOSE) enableConsoleFilter();
    await client.close();
    disableConsoleFilter();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

log("🚀 Starting Banesco sync...\n");

main().catch((err) => {
  disableConsoleFilter();
  log(`💥 Failed: ${err.message}`);
  process.exit(1);
});
