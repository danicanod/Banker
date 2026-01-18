/**
 * Shared Sync Utilities
 *
 * Common helpers for bank sync scripts. Keeps the main scripts minimal and consistent.
 */

import dotenv from "dotenv";
import { createHash } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// ============================================================================
// Environment
// ============================================================================

/**
 * Load environment variables from .env and .env.local
 */
export function loadEnv(): void {
  dotenv.config();
  dotenv.config({ path: ".env.local" });
}

/**
 * Validate required environment variables. Exits with code 1 if any are missing.
 */
export function requireEnv<T extends Record<string, string>>(
  keys: (keyof T)[]
): T {
  const missing: string[] = [];
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key as string];
    if (!value) {
      missing.push(key as string);
    } else {
      result[key as string] = value;
    }
  }

  if (missing.length > 0) {
    console.log(`❌ Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  return result as T;
}

// ============================================================================
// Console Filtering
// ============================================================================

const originalLog = console.log;
const originalWarn = console.warn;
let filterActive = false;

/**
 * Patterns that are allowed through even when filtering (high-signal messages)
 */
const ALLOW_PATTERNS = [
  /^🚀 Starting/,
  /^✅ Login/,
  /^✅ Found/,
  /^✅ Done/,
  /^📊 Fetching/,
  /^📋 Preview/,
  /^📤 Pushing/,
  /^❌/,
  /^💥/,
  /^🎉/,
  /^\s+\d{4}-\d{2}-\d{2}/, // Preview transaction lines
  /^\s+\.\.\. and \d+ more/, // "... and N more"
  /^\s+New:|^\s+Skipped:/, // Summary lines
];

/**
 * Patterns that are always suppressed when filtering
 */
const DENY_PATTERNS = [
  /^🚫 Blocked/,
  /^\[BanescoHTTP\]/,
  /^\[BncHTTP\]/,
  /^⚡ Performance/,
  /^⚡ Setting up/,
  /^🏦.*initialized/,
  /^🔑 Mapped:/,
  /^⏳ Waiting/,
  /^🔍 (Looking|Waiting)/,
  /^🔘 Clicking/,
  /^✏️ Filling/,
  /^📋 Question:/,
  /^🎯 Answer:/,
  /^🗂️ /,
  /^🧱 Blocked resources/,
  /^🧹/,
  /^📄 Debug session/,
  /^📍 Current URL/,
  /^🌐 (Initializing|Navigating)/,
  /^🔐 (Starting|Handling|Security)/,
  /^👤 Step/,
  /^❓ Step/,
  /^🔑 Step/,
  /^🔒 Security/,
  /Configurando bloqueo/,
];

function shouldAllowMessage(msg: string): boolean {
  // Check deny list first
  if (DENY_PATTERNS.some((p) => p.test(msg))) {
    return false;
  }
  // Then check allow list
  return ALLOW_PATTERNS.some((p) => p.test(msg));
}

/**
 * Enable console filtering for minimal output.
 * Set SYNC_VERBOSE=true to disable filtering.
 */
export function enableConsoleFilter(): void {
  if (process.env.SYNC_VERBOSE === "true") {
    return; // Don't filter in verbose mode
  }

  if (filterActive) return;
  filterActive = true;

  console.log = (...args: unknown[]) => {
    const msg = String(args[0] ?? "");
    if (shouldAllowMessage(msg)) {
      originalLog(...args);
    }
  };

  console.warn = () => {
    // Suppress warnings entirely in minimal mode
  };
}

/**
 * Disable console filtering (restore original console)
 */
export function disableConsoleFilter(): void {
  console.log = originalLog;
  console.warn = originalWarn;
  filterActive = false;
}

/**
 * Always log to the original console (bypasses any filtering)
 */
export function log(message: string): void {
  originalLog(message);
}

// ============================================================================
// Transaction Key Generation
// ============================================================================

interface TxnKeyInput {
  date: string;
  amount: number;
  description: string;
  type: string;
}

/**
 * Generate a deterministic transaction key (hash) for idempotent ingestion.
 */
export function makeTxnKey(bank: string, tx: TxnKeyInput): string {
  const key = [
    tx.date,
    String(Math.abs(tx.amount)),
    tx.description.trim(),
    tx.type,
  ].join("|");
  return `${bank}-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

// ============================================================================
// Preview Printing
// ============================================================================

interface PreviewTransaction {
  date: string;
  amount: number;
  type: "debit" | "credit";
  description: string;
}

/**
 * Print a preview of transactions (first N).
 */
export function printPreview(
  transactions: PreviewTransaction[],
  limit: number = parseInt(process.env.SYNC_PREVIEW_LIMIT || "5", 10)
): void {
  if (transactions.length === 0) {
    log("⚠️  No transactions found.");
    return;
  }

  log("📋 Preview:");
  for (const tx of transactions.slice(0, limit)) {
    const icon = tx.type === "debit" ? "📤" : "📥";
    const amountStr = String(tx.amount).padStart(12);
    const desc = tx.description.slice(0, 40);
    log(`   ${tx.date} ${icon} ${amountStr} | ${desc}`);
  }
  if (transactions.length > limit) {
    log(`   ... and ${transactions.length - limit} more\n`);
  }
}

// ============================================================================
// Convex Ingestion
// ============================================================================

interface NormalizedTransaction {
  bank: string;
  txnKey: string;
  date: string;
  amount: number;
  description: string;
  type: "debit" | "credit";
  balance: number;
  accountId?: string;
  raw?: unknown;
}

interface IngestResult {
  insertedCount: number;
  skippedDuplicates: number;
}

/**
 * Push normalized transactions to Convex.
 */
export async function ingestToConvex(
  convexUrl: string,
  transactions: NormalizedTransaction[]
): Promise<IngestResult> {
  const convex = new ConvexHttpClient(convexUrl);
  const result = await convex.mutation(api.transactions.ingestFromLocal, {
    transactions,
  });
  return result;
}

interface UpdateDescriptionResult {
  updatedCount: number;
  skippedCount: number;
}

/**
 * Update descriptions for existing transactions.
 * Useful when re-scraping to refresh memos/descriptions.
 */
export async function updateDescriptions(
  convexUrl: string,
  updates: Array<{ txnKey: string; description: string }>
): Promise<UpdateDescriptionResult> {
  const convex = new ConvexHttpClient(convexUrl);
  const result = await convex.mutation(
    api.notion_movimientos_mutations.batchUpdateDescriptions,
    { updates }
  );
  return result;
}

// ============================================================================
// Script Runner Wrapper
// ============================================================================

/**
 * Wrap the main sync function with consistent error handling and cleanup.
 */
export async function runSync(
  bankName: string,
  fn: () => Promise<void>
): Promise<void> {
  log(`🚀 Starting ${bankName} sync...\n`);
  enableConsoleFilter();

  try {
    await fn();
  } catch (err: unknown) {
    disableConsoleFilter();
    const message = err instanceof Error ? err.message : String(err);
    log(`💥 Failed: ${message}`);
    process.exit(1);
  } finally {
    disableConsoleFilter();
  }
}
