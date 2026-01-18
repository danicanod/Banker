/**
 * Banker Venezuela - Enterprise Banking Scraper Library
 *
 * A TypeScript library for scraping Venezuelan bank accounts.
 * Supports Banesco (hybrid: Playwright login + HTTP fetch) and BNC (pure HTTP).
 *
 * @example
 * ```typescript
 * import { BanescoScraper, BncScraper } from '@danicanod/banker-venezuela';
 *
 * // Banesco usage (hybrid mode - Playwright required for login)
 * const banesco = new BanescoScraper(credentials, { headless: true });
 * const session = await banesco.scrapeAll();
 *
 * // BNC usage (pure HTTP - no browser needed)
 * const bnc = new BncScraper(credentials);
 * const session = await bnc.scrapeAll();
 * ```
 */

// ============================================================================
// Banesco Bank Exports (Hybrid: Playwright login + HTTP data fetch)
// ============================================================================

export {
  BanescoScraper,
  createBanescoScraper,
  quickScrape as quickScrapeBanesco,
} from './banks/banesco/scrapers/banesco-scraper.js';

export { BanescoAuth } from './banks/banesco/auth/banesco-auth.js';
export { BanescoTransactionsScraper } from './banks/banesco/scrapers/transactions.js';
export { AccountsScraper as BanescoAccountsScraper } from './banks/banesco/scrapers/accounts.js';
export { OptimizedLogin as BanescoOptimizedLogin } from './banks/banesco/auth/optimized-login.js';
export { SecurityQuestionsHandler } from './banks/banesco/auth/security-questions.js';

export type {
  BanescoCredentials,
  BanescoLoginResult,
  BanescoAuthConfig,
  BanescoScrapingConfig,
  BanescoScrapingResult,
  BanescoAccount,
  BanescoTransaction,
  BrowserConfig as BanescoBrowserConfig,
} from './banks/banesco/types/index.js';

export {
  BANESCO_URLS,
  BANESCO_CONFIG,
} from './banks/banesco/types/index.js';

export type { BanescoScrapingSession } from './banks/banesco/scrapers/banesco-scraper.js';

// Banesco HTTP Client (for hybrid mode: Playwright login + HTTP data fetch)
export {
  BanescoHttpClient,
  createBanescoHttpClient,
} from './banks/banesco/http/index.js';

export type {
  BanescoHttpCredentials,
  BanescoHttpConfig,
  BanescoHttpTransaction,
  BanescoHttpAccount,
  BanescoAccountsResult,
  BanescoMovementsResult,
} from './banks/banesco/http/index.js';

// ============================================================================
// BNC Bank Exports (Pure HTTP - no browser needed)
// ============================================================================

export {
  BncScraper,
  createBncScraper,
  quickScrape as quickScrapeBnc,
} from './banks/bnc/scrapers/bnc-scraper.js';

// BNC HTTP Client (direct access for advanced usage)
export {
  BncHttpClient,
  createBncHttpClient,
  quickHttpLogin,
  quickHttpScrape,
} from './banks/bnc/http/index.js';

export type {
  BncHttpConfig,
  BncHttpLoginResult,
} from './banks/bnc/http/index.js';

export type {
  BncCredentials,
  BncLoginResult,
  BncAuthConfig,
  BncScrapingConfig,
  BncScrapingResult,
  BncAccount,
  BncTransaction,
  BrowserConfig as BncBrowserConfig,
} from './banks/bnc/types/index.js';

export {
  BncAccountType,
  BNC_URLS,
  BNC_SELECTORS,
  BNC_CONFIG,
} from './banks/bnc/types/index.js';

export type { BncScrapingSession } from './banks/bnc/scrapers/bnc-scraper.js';

// ============================================================================
// Shared Infrastructure Exports
// ============================================================================

export { BaseBankAuth } from './shared/base-bank-auth.js';
export { BaseBankScraper } from './shared/base-bank-scraper.js';

export type {
  BaseBankAuthConfig,
  BaseBankLoginResult,
  BaseBankCredentials,
  BaseBankScrapingConfig,
  BaseBankScrapingResult,
} from './shared/types/index.js';

export {
  PERFORMANCE_PRESETS,
  type PerformanceConfig,
} from './shared/performance-config.js';
