/**
 * BNC Main Scraper with HTTP and Playwright Support
 * 
 * This module provides the main scraping functionality for BNC online banking,
 * integrating authentication and transaction extraction in a unified interface.
 * 
 * Features:
 * - HTTP-first mode: Uses pure HTTP requests for faster scraping (no browser needed)
 * - Playwright fallback: Falls back to browser automation if HTTP fails
 * - Configurable via environment variable or config option
 */

import { Browser, Page, chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { BncAuth } from '../auth/bnc-auth.js';
import { BncTransactionsScraper } from './transactions.js';
import { BncHttpClient, createBncHttpClient } from '../http/bnc-http-client.js';
import type { 
  BncCredentials, 
  BncAuthConfig, 
  BncScrapingConfig, 
  BncLoginResult, 
  BncScrapingResult,
  BncTransaction 
} from '../types/index.js';

export interface BncScrapingSession {
  authResult: BncLoginResult;
  transactionResults: BncScrapingResult[];
  browser?: Browser;
  page?: Page;
  /** Indicates which method was used */
  method?: 'http' | 'playwright';
}

export interface BncFullScrapingConfig extends BncAuthConfig, BncScrapingConfig {
  authenticateFirst?: boolean;  // Default: true
  closeAfterScraping?: boolean; // Default: true
  /** 
   * Force Playwright mode even when HTTP would work.
   * Can also be set via BNC_FORCE_PLAYWRIGHT=true environment variable.
   * Default: false (prefers HTTP)
   */
  forcePlaywright?: boolean;
  /**
   * Disable HTTP fallback to Playwright if HTTP fails.
   * Default: false (fallback enabled)
   */
  disableFallback?: boolean;
}

export class BncScraper {
  private credentials: BncCredentials;
  private config: BncFullScrapingConfig;
  private auth?: BncAuth;
  private browser?: Browser;
  private page?: Page;
  private httpClient?: BncHttpClient;
  private usedMethod?: 'http' | 'playwright';

  constructor(credentials: BncCredentials, config: BncFullScrapingConfig = {}) {
    this.credentials = credentials;
    this.config = {
      authenticateFirst: true,
      closeAfterScraping: true,
      forcePlaywright: process.env.BNC_FORCE_PLAYWRIGHT === 'true',
      disableFallback: false,
      ...config
    };
  }

  /**
   * Check if HTTP mode should be used
   */
  private shouldUseHttp(): boolean {
    return !this.config.forcePlaywright;
  }

  /**
   * Perform complete scraping: authentication + transactions
   * Prefers HTTP mode, falls back to Playwright if needed
   */
  async scrapeAll(): Promise<BncScrapingSession> {
    console.log('🚀 Starting BNC complete scraping session...');
    
    // Try HTTP mode first (unless force Playwright)
    if (this.shouldUseHttp()) {
      console.log('⚡ Attempting HTTP mode (faster, no browser)...');
      
      try {
        const httpSession = await this.scrapeAllHttp();
        
        if (httpSession.authResult.success && httpSession.transactionResults.length > 0) {
          const totalTransactions = httpSession.transactionResults.reduce(
            (sum, r) => sum + (r.data?.length || 0), 0
          );
          
          if (totalTransactions > 0 || !this.config.disableFallback === false) {
            console.log(`🎉 HTTP mode successful: ${totalTransactions} transactions`);
            return httpSession;
          }
        }
        
        // HTTP mode failed or no transactions, try fallback
        if (!this.config.disableFallback) {
          console.log('⚠️  HTTP mode incomplete, falling back to Playwright...');
        } else {
          console.log('⚠️  HTTP mode incomplete, fallback disabled');
          return httpSession;
        }
        
      } catch (error: any) {
        console.log(`⚠️  HTTP mode failed: ${error.message}`);
        
        if (this.config.disableFallback) {
          return {
            authResult: { 
              success: false, 
              message: `HTTP failed: ${error.message}`, 
              sessionValid: false,
              error: error.message
            },
            transactionResults: [],
            method: 'http'
          };
        }
        
        console.log('🔄 Falling back to Playwright mode...');
      }
    }
    
    // Use Playwright mode
    return this.scrapeAllPlaywright();
  }

  /**
   * HTTP-based scraping (faster, no browser)
   */
  private async scrapeAllHttp(): Promise<BncScrapingSession> {
    const session: BncScrapingSession = {
      authResult: { success: false, message: '', sessionValid: false },
      transactionResults: [],
      method: 'http'
    };

    this.httpClient = createBncHttpClient(this.credentials, {
      timeout: this.config.timeout,
      debug: this.config.debug
    });

    // Login via HTTP
    const loginResult = await this.httpClient.login();
    
    session.authResult = {
      success: loginResult.success,
      message: loginResult.message,
      sessionValid: loginResult.authenticated,
      error: loginResult.error
    };

    if (!loginResult.success) {
      return session;
    }

    // Fetch transactions via HTTP
    const transactionResult = await this.httpClient.fetchLast25Transactions();
    session.transactionResults.push(transactionResult);

    this.usedMethod = 'http';
    console.log(`✅ HTTP mode completed: ${transactionResult.data?.length || 0} transactions`);

    return session;
  }

  /**
   * Playwright-based scraping (original method)
   */
  private async scrapeAllPlaywright(): Promise<BncScrapingSession> {
    console.log('🎭 Using Playwright mode (browser automation)...');
    
    const session: BncScrapingSession = {
      authResult: { success: false, message: '', sessionValid: false },
      transactionResults: [],
      method: 'playwright'
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
        
        const transactionScraper = new BncTransactionsScraper(this.page, this.config);
        const transactionResult = await transactionScraper.scrapeTransactions();
        
        session.transactionResults.push(transactionResult);
        
        console.log(`✅ Transaction scraping completed: ${transactionResult.data?.length || 0} transactions`);
      }

      // Store browser and page references
      session.browser = this.browser;
      session.page = this.page;
      this.usedMethod = 'playwright';

      // Clean up if configured
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
   * Authenticate with BNC
   */
  async authenticate(): Promise<BncLoginResult> {
    try {
      this.auth = new BncAuth(this.credentials, this.config);
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
  async scrapeTransactions(): Promise<BncScrapingResult> {
    if (!this.page) {
      throw new Error('No authenticated page available. Call authenticate() first.');
    }

    const scraper = new BncTransactionsScraper(this.page, this.config);
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
    return this.auth?.isLoggedIn() || this.httpClient?.isLoggedIn() || false;
  }

  /**
   * Get the method used for the last scraping session
   */
  getUsedMethod(): 'http' | 'playwright' | undefined {
    return this.usedMethod;
  }

  /**
   * Scrape using HTTP-only mode (no Playwright fallback)
   */
  async scrapeHttpOnly(): Promise<BncScrapingSession> {
    return this.scrapeAllHttp();
  }

  /**
   * Scrape using Playwright-only mode (no HTTP attempt)
   */
  async scrapePlaywrightOnly(): Promise<BncScrapingSession> {
    return this.scrapeAllPlaywright();
  }

  /**
   * Export session data to file
   */
  exportSession(session: BncScrapingSession, filename?: string): string {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `bnc-session-${timestamp}.json`;
      const exportFilename = filename || defaultFilename;
      
      // Prepare export data (exclude browser/page references)
      const exportData = {
        bank: 'BNC',
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
      
      if (this.httpClient) {
        await this.httpClient.reset();
      }
      
      this.page = undefined;
      this.browser = undefined;
      this.auth = undefined;
      this.httpClient = undefined;
      
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