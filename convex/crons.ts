/**
 * Convex Cron Jobs for Bank Transaction Sync
 * 
 * Automated scheduling for bank scraping and Notion synchronization.
 * All jobs run in Convex's serverless environment.
 * 
 * ## Jobs
 * 
 * | Job | Schedule | Description |
 * |-----|----------|-------------|
 * | `sync-banesco-transactions` | 11:00 UTC (07:00 VE) | Banesco scrape via Browserbase |
 * | `sync-notion-bidirectional` | Every 15 min | Notion pull + push |
 * 
 * ## Requirements
 * 
 * - Browserbase sync requires: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`
 * - Notion sync requires: `NOTION_API_TOKEN`, `NOTION_MOVIMIENTOS_DATABASE_ID`
 * 
 * ## Timezone Reference (Venezuela = UTC-4)
 * 
 * - 06:00 VE = 10:00 UTC
 * - 07:00 VE = 11:00 UTC (current Banesco sync time)
 * - 19:00 VE = 23:00 UTC
 * 
 * @see {@link internal.sync.syncBanescoDaily} - Browserbase scraping action
 * @see {@link internal.notion.syncNotionAll} - Notion bidirectional sync
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
