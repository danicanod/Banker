/**
 * Local Sync Script
 * 
 * Syncs Banesco transactions to Convex.
 * 
 * Usage:
 *   npx tsx scripts/local-sync.ts
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

import { ConvexHttpClient } from "convex/browser";
import { BanescoAuth } from "../src/banks/banesco/auth/banesco-auth.js";
import { BanescoHttpClient } from "../src/banks/banesco/http/index.js";
import { api } from "../convex/_generated/api.js";
import { createHash } from "crypto";

// Suppress SDK logging
const originalLog = console.log;
const originalWarn = console.warn;
let suppressSdkLogs = false;

function suppressLogs() {
  suppressSdkLogs = true;
  console.log = (...args: any[]) => {
    const msg = args[0]?.toString() || "";
    // Only show key progress messages, hide SDK details
    if (
      msg.includes("🚀 Starting") ||
      msg.includes("✅ Login") ||
      msg.includes("🎉") ||
      msg.includes("❌") ||
      msg.includes("💥")
    ) {
      originalLog(...args);
    }
  };
  console.warn = () => {}; // Suppress warnings
}

function restoreLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
  suppressSdkLogs = false;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  balance: number;
}

function generateTxnId(tx: { date: string; amount: number; description: string; type: string }): string {
  const key = [tx.date, String(Math.abs(tx.amount)), tx.description.trim(), tx.type].join("|");
  return `banesco-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

async function main() {
  originalLog("🚀 Starting Banesco sync...\n");

  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    originalLog("❌ Missing CONVEX_URL in .env.local");
    originalLog("   Run: npx convex dev");
    process.exit(1);
  }

  const credentials = {
    username: process.env.BANESCO_USERNAME!,
    password: process.env.BANESCO_PASSWORD!,
    securityQuestions: process.env.BANESCO_SECURITY_QUESTIONS!,
  };

  if (!credentials.username || !credentials.password || !credentials.securityQuestions) {
    originalLog("❌ Missing Banesco credentials in .env");
    process.exit(1);
  }

  let auth: BanescoAuth | null = null;
  
  try {
    // Step 1: Login with Playwright (suppress verbose SDK logs)
    originalLog("🔐 Logging into Banesco...");
    suppressLogs();
    
    auth = new BanescoAuth(credentials, {
      headless: true,
      timeout: 60000,
    });

    const loginResult = await auth.login();
    restoreLogs();
    
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.message}`);
    }
    
    // Step 2: Wait for dashboard and export cookies
    const page = auth.getPage();
    if (!page) throw new Error("No page after login");
    
    // Wait for navigation to dashboard
    const currentUrl = page.url();
    
    if (currentUrl.toLowerCase().includes("login")) {
      await page.waitForURL(/Default\.aspx|Principal\.aspx|Dashboard/i, { timeout: 30000 });
    }
    
    // Extra wait for cookies to be set
    await page.waitForTimeout(2000);
    
    originalLog("✅ Login successful\n");

    // Export cookies
    const cookies = await page.context().cookies();

    // Step 3: Fetch transactions via HTTP
    originalLog("📊 Fetching transactions...");
    const httpClient = new BanescoHttpClient(credentials, {
      skipLogin: true,
      timeout: 30000,
    });
    httpClient.importCookiesFromPlaywright(cookies);

    // Get accounts first
    const accountsResult = await httpClient.getAccounts();
    const allTransactions: Transaction[] = [];

    if (accountsResult.success && accountsResult.accounts.length > 0) {
      for (const account of accountsResult.accounts) {
        const movementsResult = await httpClient.getAccountMovements(account.accountNumber);
        
        if (movementsResult.success && movementsResult.transactions.length > 0) {
          for (const tx of movementsResult.transactions) {
            allTransactions.push({
              id: generateTxnId(tx),
              date: tx.date || new Date().toISOString().split("T")[0],
              description: tx.description,
              amount: tx.amount,
              type: tx.type,
              balance: tx.balance || 0,
            });
          }
        }
      }
      originalLog(`✅ Found ${allTransactions.length} transactions from ${accountsResult.accounts.length} account(s)\n`);
    } else {
      // Fallback to basic fetch
      const result = await httpClient.getTransactions();
      if (result.success) {
        for (const tx of result.transactions) {
          allTransactions.push({
            id: generateTxnId(tx),
            date: tx.date || new Date().toISOString().split("T")[0],
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            balance: tx.balance || 0,
          });
        }
      }
      originalLog(`✅ Found ${allTransactions.length} transactions\n`);
    }

    if (allTransactions.length === 0) {
      originalLog("⚠️  No transactions found.");
      return;
    }

    // Show preview
    originalLog("📋 Preview:");
    for (const tx of allTransactions.slice(0, 5)) {
      const icon = tx.type === "debit" ? "📤" : "📥";
      originalLog(`   ${tx.date} ${icon} ${String(tx.amount).padStart(12)} | ${tx.description.slice(0, 40)}`);
    }
    if (allTransactions.length > 5) {
      originalLog(`   ... and ${allTransactions.length - 5} more\n`);
    }

    // Step 4: Push to Convex
    originalLog("📤 Pushing to Convex...");
    const convex = new ConvexHttpClient(convexUrl);

    const normalizedTxs = allTransactions.map((tx) => ({
      bank: "banesco",
      txnKey: tx.id,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      type: tx.type,
      balance: tx.balance,
      raw: tx,
    }));

    const result = await convex.mutation(api.transactions.ingestFromLocal, {
      transactions: normalizedTxs,
    });

    originalLog(`\n✅ Done!`);
    originalLog(`   New: ${result.insertedCount} | Skipped: ${result.skippedDuplicates}`);

  } finally {
    restoreLogs();
    if (auth) {
      suppressLogs();
      await auth.close();
      restoreLogs();
    }
  }
}

main().catch((err) => {
  restoreLogs();
  originalLog("💥 Failed:", err.message);
  process.exit(1);
});
