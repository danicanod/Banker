/**
 * Banesco Sync Script
 *
 * Syncs Banesco transactions to Convex using hybrid mode:
 * - Playwright for login (handles JS/iframes/security questions)
 * - HTTP for fast transaction fetching
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

import { BanescoAuth, BanescoHttpClient } from "@danicanod/banker-scrapers-ve";

// ============================================================================
// Types
// ============================================================================

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  accountId?: string;
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

  const credentials = {
    username: BANESCO_USERNAME,
    password: BANESCO_PASSWORD,
    securityQuestions: BANESCO_SECURITY_QUESTIONS,
  };

  let auth: BanescoAuth | null = null;

  try {
    // Step 1: Login with Playwright
    log("🔐 Logging into Banesco...");
    enableConsoleFilter();

    auth = new BanescoAuth(credentials, {
      headless: true,
      timeout: 60000,
    });

    const loginResult = await auth.login();
    disableConsoleFilter();

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.message}`);
    }

    log("✅ Login successful\n");

    // Step 2: Export cookies from authenticated session
    const page = auth.getPage();
    if (!page) throw new Error("No page after login");

    // Brief wait for cookies to stabilize (no URL wait - that's what caused timeouts)
    await page.waitForTimeout(1500);

    const cookies = await page.context().cookies();

    // Step 3: Fetch transactions via HTTP
    log("📊 Fetching transactions...");
    enableConsoleFilter();

    const httpClient = new BanescoHttpClient(credentials, {
      skipLogin: true,
      timeout: 30000,
    });
    httpClient.importCookiesFromPlaywright(cookies);

    const allTransactions: Transaction[] = [];

    // Get accounts first
    const accountsResult = await httpClient.getAccounts();

    if (accountsResult.success && accountsResult.accounts.length > 0) {
      for (const account of accountsResult.accounts) {
        const movementsResult = await httpClient.getAccountMovements(account.accountNumber);

        if (movementsResult.success && movementsResult.transactions.length > 0) {
          for (const tx of movementsResult.transactions) {
            allTransactions.push({
              id: makeTxnKey("banesco", tx),
              date: tx.date || new Date().toISOString().split("T")[0],
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
              accountId: account.accountNumber,
            });
          }
        }
      }
    } else {
      // Fallback to basic fetch
      const result = await httpClient.getTransactions();
      if (result.success) {
        for (const tx of result.transactions) {
          allTransactions.push({
            id: makeTxnKey("banesco", tx),
            date: tx.date || new Date().toISOString().split("T")[0],
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
          });
        }
      }
    }

    disableConsoleFilter();

    const accountCount = accountsResult.accounts?.length || 1;
    log(`✅ Found ${allTransactions.length} transactions from ${accountCount} account(s)\n`);

    if (allTransactions.length === 0) {
      log("⚠️  No transactions found.");
      return;
    }

    // Show preview
    printPreview(allTransactions);

    // Step 4: Push to Convex
    log("📤 Pushing to Convex...");

    const normalizedTxs = allTransactions.map((tx) => ({
      bank: "banesco" as const,
      txnKey: tx.id,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      type: tx.type,
      accountId: tx.accountId,
      raw: tx,
    }));

    const result = await ingestToConvex(CONVEX_URL, normalizedTxs);

    log(`\n✅ Done!`);
    log(`   New: ${result.insertedCount} | Skipped: ${result.skippedDuplicates}`);
  } finally {
    disableConsoleFilter();
    if (auth) {
      enableConsoleFilter();
      await auth.close();
      disableConsoleFilter();
    }
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
