// Tipos centralizados para el scraper de Banesco

import { 
  BankAccount, 
  BankTransaction, 
  BankConfig,
  BaseBankAuthConfig,
  BaseBankLoginResult,
  BaseBankCredentials,
  BaseBankScrapingConfig,
  BaseBankScrapingResult
} from '../../../shared/types/index.js';

// Re-export base types for convenience
export type {
  BankAccount as Account,
  BankTransaction as Transaction,
  LoginResult,
  ScrapingResult,
  BrowserConfig
} from '../../../shared/types/index.js';

// Banesco-specific credentials with required security questions - extends base
export interface BanescCredentials extends BaseBankCredentials {
  username: string;
  password: string;
  securityQuestions: string; // Required for Banesco
}

// Alias for backward compatibility
export type BanescoCredentials = BanescCredentials;

// Banesco authentication configuration - extends base
export interface BanescoAuthConfig extends BaseBankAuthConfig {
  // No additional properties for Banesco beyond the base
}

// Banesco scraping configuration - extends base
export interface BanescoScrapingConfig extends BaseBankScrapingConfig {
  extractAccountSummary?: boolean;  // Banesco-specific: extract balance info
}

// Banesco-specific extensions
export interface BanescAccount extends BankAccount {
  bankName: 'Banesco';
}

export interface BanescTransaction extends BankTransaction {
  bankName?: 'Banesco';
  accountName?: string;    // Account name for multi-account support
}

export interface BanescSecurityQuestion {
  question: string;
  answer: string;
  fieldName: string;
}

// Banesco URLs and constants
export const BANESCO_URLS = {
  LOGIN: 'https://www.banesconline.com/mantis/Website/Login.aspx',
  IFRAME_SELECTOR: 'iframe#ctl00_cp_frmAplicacion'
};

// Banesco configuration
export const BANESCO_CONFIG: BankConfig = {
  name: 'Banesco',
  code: 'banesco',
  baseUrl: 'https://www.banesconline.com',
  loginUrl: 'https://www.banesconline.com/mantis/Website/Login.aspx',
  supportedFeatures: ['accounts', 'transactions', 'security-questions'],
  locale: 'es-VE',
  timezone: 'America/Caracas'
};

export interface SecurityQuestionMap {
  [keyword: string]: string;
}

// Banesco login result with additional properties - extends base
export interface BanescoLoginResult extends BaseBankLoginResult {
  sessionCookies?: string[];
  systemMessage?: string;
}

// Banesco scraping result interface - extends base
export interface BanescoScrapingResult extends BaseBankScrapingResult<BanescTransaction> {
  bankName: 'Banesco';
  accountSummary?: {
    currentBalance: number | null;
    previousBalance: number | null;
    accountNumber: string | null;
    accountType: string | null;
  };
} 