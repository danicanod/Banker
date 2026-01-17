/**
 * Convex Cron Jobs for Bank Transaction Sync
 * 
 * Copy this file to your Convex project's convex/ directory.
 * 
 * Schedules daily transaction sync via Browserbase (no external worker needed).
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

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

export default crons;
