/**
 * Banesco Bank Scraper
 * 
 * Complete scraper for Banco Universal Banesco using a HYBRID approach:
 * 
 * 1. Playwright-based authentication (BanescoScraper, BanescoAuth)
 *    - REQUIRED for login (handles JS, iframes, security questions)
 *    - Establishes session cookies via JavaScript execution
 * 
 * 2. HTTP-based data fetching (BanescoHttpClient)
 *    - Uses cookies from Playwright session
 *    - ~10x faster for accounts/transactions after login
 * 
 * NOTE: Pure HTTP login is NOT supported for Banesco. The site uses
 * JavaScript-based session establishment that cannot be replicated
 * with fetch alone. Always use Playwright for authentication.
 * 
 * Recommended flow:
 *   1. Login with BanescoAuth (Playwright)
 *   2. Export cookies from Playwright context
 *   3. Import cookies to BanescoHttpClient
 *   4. Use HTTP client for fast data fetching
 * 
 * See: npm run example:banesco-hybrid
 */

// Main scraper classes (Playwright-based - REQUIRED for authentication)
export { BanescoScraper, createBanescoScraper, quickScrape } from './scrapers/banesco-scraper.js';
export { BanescoAuth } from './auth/banesco-auth.js';
export { BanescoTransactionsScraper } from './scrapers/transactions.js';

// HTTP client (for fast data fetching AFTER Playwright authentication)
export {
  BanescoHttpClient,
  createBanescoHttpClient,
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
  BanescoAccount,
  BanescoTransaction,
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
