/**
 * BNC Bank Scraper (HTTP-Only)
 * 
 * Pure HTTP-based scraper for Banco Nacional de Crédito (BNC).
 * No browser automation required - uses direct HTTP requests for
 * authentication and transaction fetching.
 * 
 * Features:
 * - Pure HTTP authentication (no Playwright needed)
 * - Fast transaction fetching (~8-10x faster than browser)
 * - Multi-account support (VES, USD)
 * - Comprehensive logging and debugging
 * - Session management and error handling
 * - Export functionality for transactions and sessions
 */

// Main scraper class (HTTP-based)
export { BncScraper, createBncScraper, quickScrape } from './scrapers/bnc-scraper.js';

// HTTP client (direct access for advanced usage)
export { 
  BncHttpClient, 
  createBncHttpClient, 
  quickHttpLogin, 
  quickHttpScrape 
} from './http/index.js';
export type { BncHttpConfig, BncHttpLoginResult } from './http/index.js';

// Types and interfaces
export type {
  BncCredentials,
  BncLoginResult,
  BncAuthConfig,
  BncAccount,
  BncTransaction,
  Account,
  Transaction,
  LoginResult,
  ScrapingResult,
  BrowserConfig
} from './types/index.js';

export {
  BncAccountType,
  BNC_URLS,
  BNC_SELECTORS,
  BNC_CONFIG
} from './types/index.js';

// Export scraping result interfaces
export type {
  BncScrapingSession
} from './scrapers/bnc-scraper.js';

export type {
  BncScrapingResult
} from './types/index.js';

// Default export for convenience
import { BncScraper } from './scrapers/bnc-scraper.js';
export default BncScraper;
