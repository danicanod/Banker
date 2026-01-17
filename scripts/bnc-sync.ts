/**
 * BNC Local Sync Script
 * 
 * Syncs BNC transactions to Convex using pure HTTP (no browser needed).
 * 
 * Usage:
 *   npx tsx scripts/bnc-sync.ts
 * 
 * Required env vars:
 *   - CONVEX_URL: Convex deployment URL
 *   - BNC_ID: BNC user ID (cedula with V prefix)
 *   - BNC_CARD: BNC card number (16 digits)
 *   - BNC_PASSWORD: BNC password
 * 
 * Optional env vars:
 *   - BNC_DEBUG: Enable verbose logging (default: false)
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

import { ConvexHttpClient } from "convex/browser";
import { createBncHttpClient } from "../src/banks/bnc/http/bnc-http-client.js";
import { api } from "../convex/_generated/api.js";
import type { BncTransaction } from "../src/banks/bnc/types/index.js";

async function main() {
  console.log("🚀 Starting BNC sync (pure HTTP)...\n");

  // Validate env vars
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.log("❌ Missing CONVEX_URL in .env.local");
    console.log("   Run: npx convex dev");
    process.exit(1);
  }

  const credentials = {
    id: process.env.BNC_ID!,
    card: process.env.BNC_CARD!,
    password: process.env.BNC_PASSWORD!,
  };

  if (!credentials.id || !credentials.card || !credentials.password) {
    console.log("❌ Missing BNC credentials in .env");
    console.log("   Required: BNC_ID, BNC_CARD, BNC_PASSWORD");
    process.exit(1);
  }

  const debug = process.env.BNC_DEBUG === "true";

  try {
    // Step 1: Login via HTTP
    console.log("🔐 Logging into BNC...");
    const client = createBncHttpClient(credentials, {
      debug,
      logoutFirst: true,
    });

    const loginResult = await client.login();

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error || loginResult.message}`);
    }

    console.log("✅ Login successful\n");

    // Step 2: Fetch transactions
    console.log("📊 Fetching Last25 transactions...");
    const scrapingResult = await client.fetchLast25Transactions();

    if (!scrapingResult.success) {
      throw new Error(`Scraping failed: ${scrapingResult.error || scrapingResult.message}`);
    }

    const transactions = scrapingResult.data;
    console.log(`✅ Found ${transactions.length} transactions from ${scrapingResult.accountsFound || 0} account(s)\n`);

    if (transactions.length === 0) {
      console.log("⚠️  No transactions found.");
      return;
    }

    // Show preview
    console.log("📋 Preview:");
    for (const tx of transactions.slice(0, 5)) {
      const icon = tx.type === "debit" ? "📤" : "📥";
      console.log(`   ${tx.date} ${icon} ${String(tx.amount).padStart(12)} | ${tx.description.slice(0, 40)}`);
    }
    if (transactions.length > 5) {
      console.log(`   ... and ${transactions.length - 5} more\n`);
    }

    // Step 3: Normalize and push to Convex
    console.log("📤 Pushing to Convex...");
    const convex = new ConvexHttpClient(convexUrl);

    const normalizedTxs = transactions.map((tx: BncTransaction) => ({
      bank: "bnc",
      txnKey: tx.id, // Already deterministic hash from BNC client
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      type: tx.type,
      balance: tx.balance || 0,
      accountId: tx.accountName,
      raw: tx,
    }));

    const result = await convex.mutation(api.transactions.ingestFromLocal, {
      transactions: normalizedTxs,
    });

    console.log(`\n✅ Done!`);
    console.log(`   New: ${result.insertedCount} | Skipped: ${result.skippedDuplicates}`);

  } catch (error: any) {
    console.log("💥 Failed:", error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.log("💥 Failed:", err.message);
  process.exit(1);
});
