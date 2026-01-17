/**
 * Banker Venezuela - Enterprise Banking Scraper Library
 *
 * A TypeScript library for scraping Venezuelan bank accounts using Playwright.
 * Supports Banesco and BNC (Banco Nacional de Crédito).
 *
 * @example
 * ```typescript
 * import { BanescoScraper, BncScraper } from '@danicanod/banker-venezuela';
 *
 * // Banesco usage
 * const banesco = new BanescoScraper(credentials, { headless: true });
 * const session = await banesco.scrapeAll();
 *
 * // BNC usage
 * const bnc = new BncScraper(credentials, { headless: true });
 * const session = await bnc.scrapeAll();
 * ```
 */

// ============================================================================
// Banesco Bank Exports
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
  BanescAccount,
  BanescTransaction,
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
  BanescoAccount,
  BanescoAccountsResult,
  BanescoMovementsResult,
} from './banks/banesco/http/index.js';

// ============================================================================
// BNC Bank Exports
// ============================================================================

export {
  BncScraper,
  createBncScraper,
  quickScrape as quickScrapeBnc,
} from './banks/bnc/scrapers/bnc-scraper.js';

export { BncAuth } from './banks/bnc/auth/bnc-auth.js';
export { BncTransactionsScraper } from './banks/bnc/scrapers/transactions.js';

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
