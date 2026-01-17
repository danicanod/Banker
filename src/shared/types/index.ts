/**
 * Shared types for banking scrapers
 */

import { PERFORMANCE_PRESETS } from '../performance-config.js';

// Shared types for all bank implementations
export * from './base.js';

// Re-export with aliases for backward compatibility
export type {
  BankCredentials as BanescCredentials,
  BankAccount as Account,
  BankTransaction as Transaction,
} from './base.js';

// Base authentication configuration that all banks should support
export interface BaseBankAuthConfig {
  headless?: boolean;      // Default: false
  timeout?: number;        // Default: 30000ms
  debug?: boolean;         // Default: false
  saveSession?: boolean;   // Default: true
  // Performance optimization options
  performancePreset?: keyof typeof PERFORMANCE_PRESETS;
  performance?: {
    blockCSS?: boolean;
    blockImages?: boolean;
    blockFonts?: boolean;
    blockMedia?: boolean;
    blockNonEssentialJS?: boolean;
    blockAds?: boolean;
    blockAnalytics?: boolean;
  };
}

// Base authentication result interface
export interface BaseBankLoginResult {
  success: boolean;
  message: string;
  sessionValid: boolean;
  error?: string;
}

// Base bank credentials interface (can be extended by specific banks)
export interface BaseBankCredentials {
  // Common fields that all banks might have
  // Specific banks can extend this interface
}

// Base scraping configuration interface
export interface BaseBankScrapingConfig {
  debug?: boolean;         // Default: false
  timeout?: number;        // Default: 30000ms
  waitBetweenActions?: number;  // Default: 1000ms
  retries?: number;        // Default: 3
  saveHtml?: boolean;      // Default: false
}

// Base scraping result interface
export interface BaseBankScrapingResult<T = any> {
  success: boolean;
  message: string;
  data?: T[];
  timestamp: Date;
  error?: string;
  metadata?: Record<string, any>;
}
