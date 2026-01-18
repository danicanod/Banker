/**
 * Banesco Main Scraper with Playwright
 * 
 * This module provides the main scraping functionality for Banesco online banking,
 * integrating authentication and transaction extraction in a unified interface.
 */

import { Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { BanescoAuth } from '../auth/banesco-auth.js';
import { BanescoTransactionsScraper } from './transactions.js';
import type { 
  BanescoCredentials, 
  BanescoAuthConfig, 
  BanescoScrapingConfig, 
  BanescoLoginResult, 
  BanescoScrapingResult,
  BanescoTransaction 
} from '../types/index.js';

export interface BanescoScrapingSession {
  authResult: BanescoLoginResult;
  transactionResults: BanescoScrapingResult[];
  browser?: Browser;
  page?: Page;
}

export interface BanescoFullScrapingConfig extends BanescoAuthConfig, BanescoScrapingConfig {
  authenticateFirst?: boolean;  // Default: true
  closeAfterScraping?: boolean; // Default: true
}

export class BanescoScraper {
  private credentials: BanescoCredentials;
  private config: BanescoFullScrapingConfig;
  private auth?: BanescoAuth;
  private browser?: Browser;
  private page?: Page;

  constructor(credentials: BanescoCredentials, config: BanescoFullScrapingConfig = {}) {
    this.credentials = credentials;
    this.config = {
      authenticateFirst: true,
      closeAfterScraping: true,
      ...config
    };
  }

  /**
   * Perform complete scraping: authentication + transactions
   */
  async scrapeAll(): Promise<BanescoScrapingSession> {
    console.log('🚀 Starting Banesco complete scraping session...');
    
    const session: BanescoScrapingSession = {
      authResult: { success: false, message: '', sessionValid: false },
      transactionResults: []
    };

    try {
      // Step 1: Authentication (if enabled)
      if (this.config.authenticateFirst) {
        console.log('🔐 Starting authentication...');
        session.authResult = await this.authenticate();
        
        if (!session.authResult.success) {
          throw new Error(`Authentication failed: ${session.authResult.message}`);
        }
        
        console.log('✅ Authentication successful');
      }

      // Step 2: Transaction scraping
      if (this.page && session.authResult.success) {
        console.log('📊 Starting transaction scraping...');
        
        const transactionScraper = new BanescoTransactionsScraper(this.page, this.config);
        const transactionResult = await transactionScraper.scrapeTransactions();
        
        session.transactionResults.push(transactionResult);
        
        console.log(`✅ Transaction scraping completed: ${transactionResult.data?.length || 0} transactions`);
      }

      // Store browser and page references
      session.browser = this.browser;
      session.page = this.page;

      // Clean up if configured
      if (this.config.closeAfterScraping) {
        await this.close();
        console.log('🧹 Session cleaned up');
      }

      console.log('🎉 Banesco scraping session completed successfully');
      return session;

    } catch (error: any) {
      console.error(`💥 Banesco scraping session failed: ${error.message}`);
      
      // Ensure cleanup on error
      await this.close();
      
      // Update session with error
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
   * Authenticate with Banesco
   */
  async authenticate(): Promise<BanescoLoginResult> {
    try {
      this.auth = new BanescoAuth(this.credentials, this.config);
      const result = await this.auth.login();
      
      if (result.success) {
        this.page = this.auth.getPage() || undefined;
        // Store browser reference (access private property through type assertion)
        this.browser = (this.auth as any).browser;
      }
      
      return result;
      
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
        sessionValid: false,
        error: error.message
      };
    }
  }

  /**
   * Scrape transactions only (requires existing authentication)
   */
  async scrapeTransactions(): Promise<BanescoScrapingResult> {
    if (!this.page) {
      throw new Error('No authenticated page available. Call authenticate() first.');
    }

    const scraper = new BanescoTransactionsScraper(this.page, this.config);
    return await scraper.scrapeTransactions();
  }

  /**
   * Get current authenticated page
   */
  getPage(): Page | null {
    return this.page || null;
  }

  /**
   * Get current browser instance
   */
  getBrowser(): Browser | null {
    return this.browser || null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.auth?.isLoggedIn() || false;
  }

  /**
   * Export session data to file
   */
  exportSession(session: BanescoScrapingSession, filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `banesco-session-${timestamp}.json`;
      const exportFilename = filename || defaultFilename;
      
      // Prepare export data (exclude browser/page references)
      const exportData = {
        bank: 'Banesco',
        exported: new Date().toISOString(),
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
   * Close browser and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.auth) {
        await this.auth.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }
      
      this.page = undefined;
      this.browser = undefined;
      this.auth = undefined;
      
    } catch (error) {
      console.warn(`⚠️  Error during cleanup: ${error}`);
    }
  }
}

/**
 * Factory function to create Banesco scraper
 */
export function createBanescoScraper(
  credentials: BanescoCredentials, 
  config?: BanescoFullScrapingConfig
): BanescoScraper {
  return new BanescoScraper(credentials, config);
}

/**
 * Quick scraping function for simple use cases
 */
export async function quickScrape(
  credentials: BanescoCredentials,
  config?: Partial<BanescoFullScrapingConfig>
): Promise<BanescoTransaction[]> {
  const scraper = createBanescoScraper(credentials, config);
  
  try {
    const session = await scraper.scrapeAll();
    
    // Combine all transactions from all results
    const allTransactions: BanescoTransaction[] = [];
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