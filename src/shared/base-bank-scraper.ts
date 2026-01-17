/**
 * Abstract Base Bank Scraper Class
 * 
 * This abstract class provides common functionality for all bank scraper
 * implementations, including navigation, element waiting, logging, data extraction,
 * and common scraping patterns with performance optimizations.
 */

import { Page } from 'playwright';
import type { BankTransaction, ScrapingResult } from './types/index.js';
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';

export interface BaseBankScrapingConfig {
  debug?: boolean;         // Default: false
  timeout?: number;        // Default: 30000ms
  waitBetweenActions?: number;  // Default: 1000ms
  retries?: number;        // Default: 3
  saveHtml?: boolean;      // Default: false
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
  protected logFile: string;
  protected bankName: string;

  constructor(bankName: string, page: Page, config: TConfig) {
    this.bankName = bankName;
    this.page = page;
    this.config = this.getDefaultConfig(config);
    
    // Setup log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = `${bankName.toLowerCase()}-scraper-${timestamp}.log`;
    
    this.log(`🏦 ${bankName} Scraper initialized with performance optimizations`);
    
    if ((this.config as any).performance) {
      const perf = (this.config as any).performance;
      this.log(`⚡ Scraper performance config: CSS:${perf.blockCSS}, IMG:${perf.blockImages}, JS:${perf.blockNonEssentialJS}`);
    }
    
    if (this.config.debug) {
      this.log('🐛 Debug mode enabled - enhanced logging and pauses available');
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
      saveHtml: false,
      performance: {
        blockCSS: false,        // More conservative for scrapers
        blockImages: true,      // Usually safe to block
        blockFonts: true,       // Safe to block
        blockMedia: true,       // Safe to block
        blockNonEssentialJS: false, // Be careful with JS on scrapers
        blockAds: true,         // Always safe to block
        blockAnalytics: true    // Always safe to block
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
   * Common logging functionality
   */
  protected log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    console.log(message);
    
    try {
      appendFileSync(this.logFile, logEntry + '\n');
    } catch (error) {
      console.warn('Failed to write to log file:', error);
    }
  }

  /**
   * Debug pause for development
   */
  protected async debugPause(message: string): Promise<void> {
    if (this.config.debug) {
      this.log(`🐛 DEBUG PAUSE: ${message}`);
      this.log('💡 Use Playwright Inspector to debug. Continue execution when ready.');
      await this.page.pause();
    }
  }

  /**
   * Wait for element to be ready (visible and enabled)
   */
  protected async waitForElementReady(selector: string, timeout?: number): Promise<boolean> {
    const actualTimeout = timeout || this.config.timeout;
    
    try {
      // Wait for element to exist
      await this.page.waitForSelector(selector, { timeout: actualTimeout });
      
      // Wait for element to be visible and enabled
      await this.page.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null && // visible
                 !element.hasAttribute('disabled'); // enabled
        },
        selector,
        { timeout: actualTimeout }
      );
      
      return true;
    } catch (error) {
      this.log(`⚠️  Element not ready: ${selector} - ${error}`);
      return false;
    }
  }

  /**
   * Navigate to the main scraping page
   */
  protected async navigateToScrapingPage(): Promise<boolean> {
    try {
      this.log(`🌐 Navigating to ${this.bankName} scraping page...`);
      
      const url = this.getScrapingUrl();
      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });
      
      await this.debugPause('Scraping page loaded - ready to extract data');
      
      this.log('✅ Navigation successful');
      return true;
      
    } catch (error) {
      this.log(`❌ Navigation failed: ${error}`);
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
      this.log(`🔍 Extracting table data using selector: ${tableSelector}`);
      
      const tableData = await this.page.$$eval(tableSelector, (tables) => {
        return tables.map(table => {
          // Ensure we're working with HTMLTableElement
          if (!(table instanceof HTMLTableElement)) {
            return { headers: [], rows: [] };
          }
          
          const rows = Array.from(table.rows);
          
          // Extract headers (first row or thead)
          const headerRow = rows[0];
          const headers = headerRow ? Array.from(headerRow.cells).map(cell => 
            cell.textContent?.trim() || ''
          ) : [];
          
          // Extract data rows (skip header)
          const dataRows = rows.slice(1).map(row => 
            Array.from(row.cells).map(cell => cell.textContent?.trim() || '')
          );
          
          return { headers, rows: dataRows };
        });
      });

      if (tableData.length === 0) {
        this.log('⚠️  No tables found');
        return { headers: [], rows: [], tableCount: 0 };
      }

      // Use first table with data
      const firstTable = tableData[0];
      
      this.log(`✅ Extracted table data: ${firstTable.headers.length} columns, ${firstTable.rows.length} rows`);
      
      return {
        headers: firstTable.headers,
        rows: firstTable.rows,
        tableCount: tableData.length
      };
      
    } catch (error) {
      this.log(`❌ Error extracting table data: ${error}`);
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
        this.log(`🔘 Clicking element: ${selector} (attempt ${attempt}/${retries})`);
        
        const ready = await this.waitForElementReady(selector);
        if (!ready) {
          throw new Error(`Element not ready: ${selector}`);
        }
        
        await this.page.click(selector);
        await this.page.waitForTimeout(this.config.waitBetweenActions ?? 1000);
        
        this.log('✅ Click successful');
        return true;
        
      } catch (error) {
        this.log(`❌ Click attempt ${attempt} failed: ${error}`);
        
        if (attempt < retries) {
          this.log('⏳ Waiting before retry...');
          await this.page.waitForTimeout(2000);
        }
      }
    }
    
    this.log(`❌ All click attempts failed for: ${selector}`);
    return false;
  }

  /**
   * Fill form field with retry logic
   */
  protected async fillFieldWithRetry(selector: string, value: string, maxRetries?: number): Promise<boolean> {
    const retries = maxRetries ?? this.config.retries ?? 3;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.log(`✏️  Filling field: ${selector} (attempt ${attempt}/${retries})`);
        
        const ready = await this.waitForElementReady(selector);
        if (!ready) {
          throw new Error(`Field not ready: ${selector}`);
        }
        
        await this.page.fill(selector, value);
        await this.page.waitForTimeout(this.config.waitBetweenActions ?? 1000);
        
        this.log('✅ Field filled successfully');
        return true;
        
      } catch (error) {
        this.log(`❌ Fill attempt ${attempt} failed: ${error}`);
        
        if (attempt < retries) {
          await this.page.waitForTimeout(1000);
        }
      }
    }
    
    return false;
  }

  /**
   * Save HTML for debugging
   */
  protected async saveHtmlForDebug(filename: string): Promise<void> {
    if (!this.config.saveHtml && !this.config.debug) return;
    
    try {
      const content = await this.page.content();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fullFilename = `${this.bankName.toLowerCase()}-${filename}-${timestamp}.html`;
      
      writeFileSync(fullFilename, content);
      this.log(`📄 HTML saved: ${fullFilename}`);
      
    } catch (error) {
      this.log(`❌ Failed to save HTML: ${error}`);
    }
  }

  /**
   * Parse amount string to number
   */
  protected parseAmount(amountString: string): number {
    try {
      // Remove currency symbols, spaces, and normalize
      const cleanAmount = amountString
        .replace(/[^\d,.-]/g, '') // Remove non-numeric except ,.-
        .replace(/\./g, '')       // Remove thousands separators
        .replace(/,/g, '.');      // Convert comma to decimal point
      
      return parseFloat(cleanAmount) || 0;
      
    } catch (error) {
      this.log(`⚠️  Failed to parse amount: ${amountString}`);
      return 0;
    }
  }

  /**
   * Parse date string to standardized format
   */
  protected parseDate(dateString: string): string {
    try {
      // Handle common Venezuelan date formats: DD/MM/YYYY, DD-MM-YYYY
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
      
      return dateString; // Return as-is if can't parse
      
    } catch (error) {
      this.log(`⚠️  Failed to parse date: ${dateString}`);
      return dateString;
    }
  }

  /**
   * Export transactions to file
   */
  exportTransactions(transactions: TTransaction[], filename?: string): string {
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
      this.log(`📤 Transactions exported to: ${exportFilename}`);
      
      return exportFilename;
      
    } catch (error) {
      this.log(`❌ Failed to export transactions: ${error}`);
      throw error;
    }
  }

  /**
   * Get log file path
   */
  getLogFile(): string {
    return this.logFile;
  }

  /**
   * Get log content
   */
  getLogContent(): string {
    try {
      if (existsSync(this.logFile)) {
        return readFileSync(this.logFile, 'utf-8');
      }
      return 'Log file not found';
    } catch (error) {
      return `Error reading log file: ${error}`;
    }
  }
} 