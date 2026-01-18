/**
 * BNC Main Scraper (HTTP-Only)
 * 
 * This module provides the main scraping functionality for BNC online banking
 * using pure HTTP requests. No browser automation is required.
 * 
 * Features:
 * - Pure HTTP-based authentication and transaction fetching
 * - ~8-10x faster than browser-based scraping
 * - No Playwright/browser dependency for BNC
 */

import { writeFileSync } from 'fs';
import { BncHttpClient, createBncHttpClient } from '../http/bnc-http-client.js';
import type { 
  BncCredentials, 
  BncScrapingResult,
  BncTransaction 
} from '../types/index.js';

export interface BncScrapingSession {
  authResult: {
    success: boolean;
    message: string;
    sessionValid: boolean;
    error?: string;
  };
  transactionResults: BncScrapingResult[];
  /** Always 'http' for BNC */
  method: 'http';
}

export interface BncFullScrapingConfig {
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Close/reset client after scraping (default: true) */
  closeAfterScraping?: boolean;
  /** 
   * Attempt to logout before login to clear any existing session.
   * Useful when BNC reports "session already active" errors.
   * Default: true
   */
  logoutFirst?: boolean;
}

export class BncScraper {
  private credentials: BncCredentials;
  private config: Required<BncFullScrapingConfig>;
  private httpClient?: BncHttpClient;

  constructor(credentials: BncCredentials, config: BncFullScrapingConfig = {}) {
    this.credentials = credentials;
    this.config = {
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      closeAfterScraping: config.closeAfterScraping ?? true,
      logoutFirst: config.logoutFirst ?? true
    };
  }

  /**
   * Perform complete scraping: authentication + transactions
   * Uses pure HTTP (no browser needed)
   */
  async scrapeAll(): Promise<BncScrapingSession> {
    console.log('🚀 Starting BNC HTTP scraping session...');
    
    const session: BncScrapingSession = {
      authResult: { success: false, message: '', sessionValid: false },
      transactionResults: [],
      method: 'http'
    };

    try {
      this.httpClient = createBncHttpClient(this.credentials, {
        timeout: this.config.timeout,
        debug: this.config.debug,
        logoutFirst: this.config.logoutFirst
      });

      // Login via HTTP
      console.log('🔐 Authenticating via HTTP...');
      const loginResult = await this.httpClient.login();
      
      session.authResult = {
        success: loginResult.success,
        message: loginResult.message,
        sessionValid: loginResult.authenticated,
        error: loginResult.error
      };

      if (!loginResult.success) {
        console.log(`❌ Authentication failed: ${loginResult.error || loginResult.message}`);
        return session;
      }

      console.log('✅ Authentication successful');

      // Fetch transactions via HTTP
      console.log('📊 Fetching transactions...');
      const transactionResult = await this.httpClient.fetchLast25Transactions();
      session.transactionResults.push(transactionResult);

      const totalTransactions = transactionResult.data?.length || 0;
      console.log(`✅ Fetched ${totalTransactions} transactions`);

      // Cleanup if configured
      if (this.config.closeAfterScraping) {
        await this.close();
        console.log('🧹 Session cleaned up');
      }

      console.log('🎉 BNC scraping session completed successfully');
      return session;

    } catch (error: any) {
      console.error(`💥 BNC scraping session failed: ${error.message}`);
      
      // Ensure cleanup on error
      await this.close();
      
      session.authResult = {
        success: false,
        message: error.message,
        sessionValid: false,
        error: error.message
      };

      return session;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.httpClient?.isLoggedIn() || false;
  }

  /**
   * Get the method used (always 'http' for BNC)
   */
  getUsedMethod(): 'http' {
    return 'http';
  }

  /**
   * Export session data to file
   */
  exportSession(session: BncScrapingSession, filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `bnc-session-${timestamp}.json`;
      const exportFilename = filename || defaultFilename;
      
      const exportData = {
        bank: 'BNC',
        exported: new Date().toISOString(),
        method: 'http',
        session: {
          authResult: session.authResult,
          transactionResults: session.transactionResults,
          totalTransactions: session.transactionResults.reduce(
            (sum, result) => sum + (result.data?.length || 0), 0
          )
        }
      };
      
      writeFileSync(exportFilename, JSON.stringify(exportData, null, 2));
      console.log(`📤 Session exported to: ${exportFilename}`);
      
      return exportFilename;
      
    } catch (error) {
      console.error(`❌ Failed to export session: ${error}`);
      throw error;
    }
  }

  /**
   * Close and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.httpClient) {
        await this.httpClient.reset();
        this.httpClient = undefined;
      }
    } catch (error) {
      console.warn(`⚠️  Error during cleanup: ${error}`);
    }
  }
}

/**
 * Factory function to create BNC scraper
 */
export function createBncScraper(
  credentials: BncCredentials, 
  config?: BncFullScrapingConfig
): BncScraper {
  return new BncScraper(credentials, config);
}

/**
 * Quick scraping function for simple use cases
 */
export async function quickScrape(
  credentials: BncCredentials,
  config?: Partial<BncFullScrapingConfig>
): Promise<BncTransaction[]> {
  const scraper = createBncScraper(credentials, config);
  
  try {
    const session = await scraper.scrapeAll();
    
    // Combine all transactions from all results
    const allTransactions: BncTransaction[] = [];
    session.transactionResults.forEach(result => {
      if (result.data) {
        allTransactions.push(...result.data);
      }
    });
    
    return allTransactions;
    
  } catch (error) {
    console.error(`💥 Quick scrape failed: ${error}`);
    throw error;
  } finally {
    await scraper.close();
  }
}
