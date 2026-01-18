/**
 * Abstract Base Bank Scraper Class
 * 
 * This abstract class provides common functionality for all bank scraper
 * implementations, including navigation, element waiting, logging, data extraction,
 * and common scraping patterns with performance optimizations.
 */

import { Page } from 'playwright';
import type { BankTransaction, ScrapingResult } from './types/index.js';
import { createLogger, type LogLevel, type Logger } from './utils/logger.js';

export interface BaseBankScrapingConfig {
  debug?: boolean;         // Default: false
  timeout?: number;        // Default: 30000ms
  waitBetweenActions?: number;  // Default: 1000ms
  retries?: number;        // Default: 3
  logLevel?: LogLevel;     // Default: 'warn'
  performance?: {          // Performance optimization settings
    blockCSS?: boolean;
    blockImages?: boolean;
    blockFonts?: boolean;
    blockMedia?: boolean;
    blockNonEssentialJS?: boolean;
    blockAds?: boolean;
    blockAnalytics?: boolean;
  };
}

export abstract class BaseBankScraper<
  TTransaction extends BankTransaction,
  TConfig extends BaseBankScrapingConfig,
  TResult extends ScrapingResult<TTransaction>
> {
  protected page: Page;
  protected config: Required<TConfig>;
  protected bankName: string;
  protected logger: Logger;

  constructor(bankName: string, page: Page, config: TConfig) {
    this.bankName = bankName;
    this.page = page;
    this.config = this.getDefaultConfig(config);
    
    // Initialize logger with configured level
    const logLevel = config.logLevel ?? 'warn';
    this.logger = createLogger(`${bankName}Scraper`, { level: logLevel });
    
    this.logger.info(`${bankName} Scraper initialized`);
    
    if ((this.config as any).performance) {
      const perf = (this.config as any).performance;
      this.logger.debug(`Performance config: CSS:${perf.blockCSS}, IMG:${perf.blockImages}, JS:${perf.blockNonEssentialJS}`);
    }
  }

  /**
   * Get default configuration with bank-specific overrides
   * Subclasses should override this to provide bank-specific defaults
   */
  protected getDefaultConfig(config: TConfig): Required<TConfig> {
    return {
      debug: false,
      timeout: 30000,
      waitBetweenActions: 1000,
      retries: 3,
      logLevel: 'warn',
      performance: {
        blockCSS: false,
        blockImages: true,
        blockFonts: true,
        blockMedia: true,
        blockNonEssentialJS: false,
        blockAds: true,
        blockAnalytics: true
      },
      ...config
    } as Required<TConfig>;
  }

  /**
   * Abstract methods that subclasses must implement
   */
  
  /**
   * Navigate to the main scraping URL for this bank
   */
  protected abstract getScrapingUrl(): string;

  /**
   * Perform the main scraping operation specific to each bank
   */
  abstract scrapeTransactions(): Promise<TResult>;

  /**
   * Parse raw transaction data into standardized format
   */
  protected abstract parseTransactionData(rawData: any[]): TTransaction[];

  /**
   * Get bank-specific selectors for common elements
   */
  protected abstract getSelectors(): Record<string, string>;

  /**
   * Debug pause for development
   */
  protected async debugPause(message: string): Promise<void> {
    if (this.config.debug) {
      this.logger.debug(`DEBUG PAUSE: ${message}`);
      await this.page.pause();
    }
  }

  /**
   * Wait for element to be ready (visible and enabled)
   */
  protected async waitForElementReady(selector: string, timeout?: number): Promise<boolean> {
    const actualTimeout = timeout || this.config.timeout;
    
    try {
      await this.page.waitForSelector(selector, { timeout: actualTimeout });
      
      await this.page.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null &&
                 !element.hasAttribute('disabled');
        },
        selector,
        { timeout: actualTimeout }
      );
      
      return true;
    } catch (error) {
      this.logger.debug(`Element not ready: ${selector}`);
      return false;
    }
  }

  /**
   * Navigate to the main scraping page
   */
  protected async navigateToScrapingPage(): Promise<boolean> {
    try {
      this.logger.debug(`Navigating to ${this.bankName} scraping page...`);
      
      const url = this.getScrapingUrl();
      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });
      
      await this.debugPause('Scraping page loaded');
      
      return true;
      
    } catch (error) {
      this.logger.error(`Navigation failed: ${error}`);
      return false;
    }
  }

  /**
   * Extract table data from page
   */
  protected async extractTableData(tableSelector: string = 'table'): Promise<{
    headers: string[];
    rows: string[][];
    tableCount: number;
  }> {
    try {
      this.logger.debug(`Extracting table data: ${tableSelector}`);
      
      const tableData = await this.page.$$eval(tableSelector, (tables) => {
        return tables.map(table => {
          if (!(table instanceof HTMLTableElement)) {
            return { headers: [], rows: [] };
          }
          
          const rows = Array.from(table.rows);
          
          const headerRow = rows[0];
          const headers = headerRow ? Array.from(headerRow.cells).map(cell => 
            cell.textContent?.trim() || ''
          ) : [];
          
          const dataRows = rows.slice(1).map(row => 
            Array.from(row.cells).map(cell => cell.textContent?.trim() || '')
          );
          
          return { headers, rows: dataRows };
        });
      });

      if (tableData.length === 0) {
        this.logger.debug('No tables found');
        return { headers: [], rows: [], tableCount: 0 };
      }

      const firstTable = tableData[0];
      
      this.logger.debug(`Extracted: ${firstTable.headers.length} columns, ${firstTable.rows.length} rows`);
      
      return {
        headers: firstTable.headers,
        rows: firstTable.rows,
        tableCount: tableData.length
      };
      
    } catch (error) {
      this.logger.error(`Error extracting table data: ${error}`);
      return { headers: [], rows: [], tableCount: 0 };
    }
  }

  /**
   * Click element with retry logic
   */
  protected async clickElementWithRetry(selector: string, maxRetries?: number): Promise<boolean> {
    const retries = maxRetries ?? this.config.retries ?? 3;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(`Clicking: ${selector} (attempt ${attempt}/${retries})`);
        
        const ready = await this.waitForElementReady(selector);
        if (!ready) {
          throw new Error(`Element not ready: ${selector}`);
        }
        
        await this.page.click(selector);
        await this.page.waitForTimeout(this.config.waitBetweenActions ?? 1000);
        
        return true;
        
      } catch (error) {
        this.logger.debug(`Click attempt ${attempt} failed`);
        
        if (attempt < retries) {
          await this.page.waitForTimeout(2000);
        }
      }
    }
    
    this.logger.warn(`All click attempts failed for: ${selector}`);
    return false;
  }

  /**
   * Fill form field with retry logic
   */
  protected async fillFieldWithRetry(selector: string, value: string, maxRetries?: number): Promise<boolean> {
    const retries = maxRetries ?? this.config.retries ?? 3;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(`Filling field: ${selector} (attempt ${attempt}/${retries})`);
        
        const ready = await this.waitForElementReady(selector);
        if (!ready) {
          throw new Error(`Field not ready: ${selector}`);
        }
        
        await this.page.fill(selector, value);
        await this.page.waitForTimeout(this.config.waitBetweenActions ?? 1000);
        
        return true;
        
      } catch (error) {
        this.logger.debug(`Fill attempt ${attempt} failed`);
        
        if (attempt < retries) {
          await this.page.waitForTimeout(1000);
        }
      }
    }
    
    return false;
  }

  /**
   * Parse amount string to number
   */
  protected parseAmount(amountString: string): number {
    try {
      const cleanAmount = amountString
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');
      
      return parseFloat(cleanAmount) || 0;
      
    } catch (error) {
      this.logger.debug(`Failed to parse amount: ${amountString}`);
      return 0;
    }
  }

  /**
   * Parse date string to standardized format
   */
  protected parseDate(dateString: string): string {
    try {
      const cleanDate = dateString.replace(/[^\d/\-]/g, '');
      
      if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      
      if (cleanDate.includes('-')) {
        const parts = cleanDate.split('-');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      
      return dateString;
      
    } catch (error) {
      this.logger.debug(`Failed to parse date: ${dateString}`);
      return dateString;
    }
  }

  /**
   * Export transactions to file (only if explicitly enabled)
   */
  exportTransactions(transactions: TTransaction[], filename?: string): string {
    const { writeFileSync } = require('fs');
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `${this.bankName.toLowerCase()}-transactions-${timestamp}.json`;
      const exportFilename = filename || defaultFilename;
      
      const exportData = {
        bank: this.bankName,
        exported: new Date().toISOString(),
        count: transactions.length,
        transactions
      };
      
      writeFileSync(exportFilename, JSON.stringify(exportData, null, 2));
      this.logger.info(`Transactions exported to: ${exportFilename}`);
      
      return exportFilename;
      
    } catch (error) {
      this.logger.error(`Failed to export transactions: ${error}`);
      throw error;
    }
  }
}
