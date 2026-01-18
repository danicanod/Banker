/**
 * Convex Cron Jobs for Bank Transaction Sync
 * 
 * Copy this file to your Convex project's convex/ directory.
 * 
 * Schedules:
 * - Daily transaction sync via Browserbase (no external worker needed)
 * - Periodic Notion bidirectional sync
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ============================================================================
// Bank Transaction Sync
// ============================================================================

/**
 * Daily Banesco transaction sync
 * 
 * Runs at 11:00 UTC (07:00 Caracas time, UTC-4)
 * Adjust hourUTC based on your preferred sync time.
 * 
 * Caracas timezone reference:
 * - 06:00 Caracas = 10:00 UTC
 * - 07:00 Caracas = 11:00 UTC
 * - 08:00 Caracas = 12:00 UTC
 * - 20:00 Caracas = 00:00 UTC (next day)
 */
crons.daily(
  "sync-banesco-transactions",
  { hourUTC: 11, minuteUTC: 0 },
  internal.sync.syncBanescoDaily
);

/**
 * Optional: Run sync twice daily for more frequent updates
 * Uncomment if needed.
 */
// crons.daily(
//   "sync-banesco-transactions-evening",
//   { hourUTC: 23, minuteUTC: 0 }, // 19:00 Caracas
//   internal.sync.syncBanescoDaily
// );

// ============================================================================
// Notion Sync
// ============================================================================

/**
 * Periodic Notion bidirectional sync
 * 
 * Runs every 15 minutes to keep Convex and Notion in sync.
 * - Pulls edits from Notion to Convex
 * - Pushes new/updated records from Convex to Notion
 * 
 * Adjust interval as needed. More frequent = more API calls.
 */
crons.interval(
  "sync-notion-bidirectional",
  { minutes: 15 },
  internal.notion.syncNotionAll
);

export default crons;
