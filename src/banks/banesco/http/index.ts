/**
 * Banesco HTTP Client Module
 * 
 * Pure HTTP-based Banesco client using fetch + cheerio.
 * No browser automation required - ~10x faster than Playwright.
 */

// Main client
export {
  BanescoHttpClient,
  createBanescoHttpClient,
  quickHttpLogin,
  type BanescoHttpCredentials,
  type BanescoHttpConfig,
  type BanescoHttpLoginResult,
  type BanescoHttpTransaction,
  type BanescoHttpScrapingResult,
  type BanescoAccount,
  type BanescoAccountsResult,
  type BanescoMovementsResult
} from './banesco-http-client.js';

// Form parsing utilities
export {
  parseLoginPage,
  parseSecurityQuestionsPage,
  parsePasswordPage,
  parseDashboardPage,
  parseTransactionsTable,
  parseAspNetFormFields,
  parseAllHiddenFields,
  parseCookies,
  serializeCookies,
  buildHuella,
  // Postback discovery for WebForms navigation
  parsePostBackActions,
  findBestTransactionPostBack,
  buildPostBackFormData,
  type AspNetFormFields,
  type SecurityQuestion,
  type ParsedLoginPage,
  type ParsedSecurityQuestionsPage,
  type ParsedPasswordPage,
  type PostBackAction
} from './form-parser.js';
