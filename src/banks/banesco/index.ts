/**
 * Banesco Bank Scraper
 * 
 * Complete scraper for Banco Universal Banesco with two modes:
 * 
 * 1. Playwright-based (BanescoScraper, BanescoAuth)
 *    - Full browser automation
 *    - Handles complex JS interactions
 *    - More reliable but slower
 * 
 * 2. HTTP-based (BanescoHttpClient) 
 *    - Pure fetch + cheerio
 *    - No browser required
 *    - ~10x faster
 * 
 * Features:
 * - Authentication with username, password, and security questions
 * - Transaction scraping with flexible table analysis
 * - Comprehensive logging and debugging
 * - Session management and error handling
 * - Export functionality for transactions and sessions
 */

// Main scraper classes (Playwright-based)
export { BanescoScraper, createBanescoScraper, quickScrape } from './scrapers/banesco-scraper.js';
export { BanescoAuth } from './auth/banesco-auth.js';
export { BanescoTransactionsScraper } from './scrapers/transactions.js';

// HTTP client (pure fetch + cheerio, no browser)
export {
  BanescoHttpClient,
  createBanescoHttpClient,
  quickHttpLogin,
  type BanescoHttpCredentials,
  type BanescoHttpConfig,
  type BanescoHttpLoginResult,
  type BanescoHttpTransaction,
  type BanescoHttpScrapingResult
} from './http/index.js';

// Types and interfaces
export type {
  BanescoCredentials,
  BanescoLoginResult,
  BanescoAuthConfig,
  BanescoScrapingConfig,
  BanescAccount,
  BanescTransaction,
  Account,
  Transaction,
  LoginResult,
  ScrapingResult,
  BrowserConfig
} from './types/index.js';

export {
  BANESCO_URLS,
  BANESCO_CONFIG
} from './types/index.js';

// Export scraping result interfaces
export type {
  BanescoScrapingSession
} from './scrapers/banesco-scraper.js';

export type {
  BanescoScrapingResult
} from './types/index.js';

// Default export for convenience
import { BanescoScraper } from './scrapers/banesco-scraper.js';
export default BanescoScraper;
