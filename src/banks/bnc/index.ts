/**
 * BNC Bank Scraper
 * 
 * Scraper for Banco Nacional de Crédito (BNC) with HTTP and Playwright support
 * 
 * Features:
 * - HTTP-first mode for fast, browser-free scraping
 * - Playwright fallback for complex scenarios
 * - Authentication with card number, ID, and password
 * - Transaction scraping for multiple accounts (VES, USD)
 * - Comprehensive logging and debugging
 * - Session management and error handling
 * - Export functionality for transactions and sessions
 */

// Main scraper classes
export { BncScraper, createBncScraper, quickScrape } from './scrapers/bnc-scraper.js';
export { BncAuth } from './auth/bnc-auth.js';
export { BncTransactionsScraper } from './scrapers/transactions.js';

// HTTP-based client (faster, no browser needed)
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
