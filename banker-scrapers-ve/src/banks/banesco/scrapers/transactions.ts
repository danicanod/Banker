/**
 * Banesco Transactions Scraper with Playwright
 * 
 * This module provides transaction scraping functionality for Banesco online banking
 * using the BaseBankScraper abstract class with Banesco-specific implementation.
 */

import { createHash } from 'node:crypto';
import { Page } from 'playwright';
import type { BanescoTransaction, BanescoScrapingConfig, BanescoScrapingResult } from '../types/index.js';
import { BaseBankScraper } from '../../../shared/index.js';

export class BanescoTransactionsScraper extends BaseBankScraper<
  BanescoTransaction,
  BanescoScrapingConfig,
  BanescoScrapingResult
> {
  constructor(page: Page, config: BanescoScrapingConfig = {}) {
    super('Banesco', page, config);
  }

  /**
   * Get default configuration with Banesco-specific defaults
   */
  protected getDefaultConfig(config: BanescoScrapingConfig): Required<BanescoScrapingConfig> {
    return {
      debug: false,
      timeout: 30000,
      waitBetweenActions: 1000,
      retries: 3,
      saveHtml: false,
      extractAccountSummary: true,  // Banesco-specific default
      ...config
    } as Required<BanescoScrapingConfig>;
  }

  /**
   * Get Banesco transactions URL - use current URL since we're authenticated
   */
  protected getScrapingUrl(): string {
    return this.page.url(); // Banesco uses the current authenticated page
  }

  /**
   * Get Banesco-specific selectors (basic table selectors)
   */
  protected getSelectors(): Record<string, string> {
    return {
      table: 'table',
      noMovementsMessage: '*:contains("no posee movimientos")',
    };
  }

  /**
   * Main scraping method - implements Banesco-specific transaction extraction
   */
  async scrapeTransactions(): Promise<BanescoScrapingResult> {
    this.log('🚀 Starting Banesco transactions scraping...');
    
    try {
      // Save HTML for debugging if enabled
      await this.saveHtmlForDebug('transactions-scraping-start');
      
      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();
      
      this.log(`📄 Transaction page loaded: ${pageTitle}`);
      this.log(`🌐 Current URL: ${currentUrl}`);

      // Check for "no movements" message first
      const hasNoMovements = await this.checkForNoMovementsMessage();
      if (hasNoMovements) {
        this.log('⚠️  No movements message detected for selected period');
        return {
          success: true,
          message: 'No hay movimientos en el período seleccionado',
          data: [],
          timestamp: new Date(),
          bankName: 'Banesco',
          metadata: {
            pageTitle,
            currentUrl
          }
        };
      }

      // Analyze table structure
      this.log('🔍 STEP 1: Analyzing table structure');
      const tableAnalysis = await this.analyzeTransactionTables();
      
      if (tableAnalysis.tables.length === 0) {
        this.log('⚠️  No transaction tables found, trying alternative extraction');
        const result = await this.alternativeDataExtraction();
        return result;
      }

      this.log(`📊 Found ${tableAnalysis.tables.length} tables with transaction data`);

      // Extract transactions from tables
      this.log('🔍 STEP 2: Extracting transaction data');
      const transactions = await this.extractTransactionsFromTables(tableAnalysis);

      // Extract account summary if enabled
      let accountSummary = undefined;
      if (this.config.extractAccountSummary) {
        this.log('🔍 STEP 3: Extracting balance information');
        accountSummary = await this.extractAccountSummary();
      }

      // Log results
      this.log(`🎉 Transaction extraction completed: ${transactions.length} transactions found`);
      
      if (transactions.length > 0 && this.config.debug) {
        this.log(`📊 Sample transactions: ${transactions.slice(0, 3).map(t => 
          `${t.date}: ${t.description.substring(0, 30)}... ${t.amount}`
        ).join(', ')}`);
      }
      
      return {
        success: true,
        message: `Successfully extracted ${transactions.length} transactions`,
        data: transactions,
        timestamp: new Date(),
        bankName: 'Banesco',
        accountSummary,
        metadata: {
          tablesFound: tableAnalysis.tables.length,
          pageTitle,
          currentUrl
        }
      };

    } catch (error: any) {
      this.log(`💥 Error in transaction scraping: ${error.message}`);
      await this.saveHtmlForDebug('transactions-error');
      
      return {
        success: false,
        message: `Scraping failed: ${error.message}`,
        data: [],
        timestamp: new Date(),
        error: error.message,
        bankName: 'Banesco'
      };
    }
  }

  /**
   * Check for "no movements" message
   */
  private async checkForNoMovementsMessage(): Promise<boolean> {
    try {
      const pageContent = await this.page.content();
      
      const noMovementsPatterns = [
        'no posee movimientos',
        'No posee movimientos',
        'NO POSEE MOVIMIENTOS',
        'no hay movimientos',
        'no existen movimientos',
        'sin movimientos',
        'no se encontraron movimientos',
        'no hay registros',
        'sin registros para mostrar'
      ];

      const hasNoMovements = noMovementsPatterns.some(pattern => 
        pageContent.includes(pattern)
      );

      if (hasNoMovements) {
        this.log('⚠️  Detected "no movements" message');
        
        // Find specific elements with these messages
        const messageElements = await this.page.$$eval('*', elements => {
          return elements
            .map(el => el.textContent?.trim() || '')
            .filter(text => 
              text.toLowerCase().includes('no posee movimientos') ||
              text.toLowerCase().includes('no hay movimientos') ||
              text.toLowerCase().includes('sin movimientos')
            )
            .slice(0, 3);
        });

        if (messageElements.length > 0) {
          this.log(`📋 Found no-movement messages: ${messageElements.join(', ')}`);
        }
      }

      return hasNoMovements;
      
    } catch (error) {
      this.log(`⚠️  Error checking for no-movements messages: ${error}`);
      return false;
    }
  }

  /**
   * Analyze transaction tables
   */
  private async analyzeTransactionTables(): Promise<{
    tables: Array<{
      index: number;
      rowCount: number;
      columnCount: number;
      headerTexts: string[];
      containsTransactionData: boolean;
      selector: string;
    }>;
  }> {
    const { tableCount } = await this.extractTableData();
    
    const tables = await this.page.$$eval('table', (tables) => {
      return tables.map((table, index) => {
        if (!(table instanceof HTMLTableElement)) {
          return null;
        }
        
        const rows = Array.from(table.rows);
        const headerRow = rows[0];
        const headerTexts = headerRow ? Array.from(headerRow.cells).map(cell => 
          cell.textContent?.trim() || ''
        ) : [];
        
        // Check if table contains transaction-like data
        const containsTransactionData = headerTexts.some(header => 
          /fecha|date|monto|amount|descripci[oó]n|description|saldo|balance/i.test(header)
        ) && rows.length > 1;
        
        return {
          index,
          rowCount: rows.length,
          columnCount: headerTexts.length,
          headerTexts,
          containsTransactionData,
          selector: `table:nth-child(${index + 1})`
        };
      }).filter(Boolean);
    });

    return { tables: tables.filter(t => t !== null) };
  }

  /**
   * Extract transactions from analyzed tables
   */
  private async extractTransactionsFromTables(tableAnalysis: any): Promise<BanescoTransaction[]> {
    const allTransactions: BanescoTransaction[] = [];

    for (const table of tableAnalysis.tables) {
      if (!table.containsTransactionData) continue;

      try {
        this.log(`📊 Processing table ${table.index + 1} with ${table.rowCount} rows`);
        
        const { headers, rows } = await this.extractTableData(`table:nth-child(${table.index + 1})`);
        
        if (rows.length === 0) continue;

        const transactions = this.parseTransactionData(rows);
        allTransactions.push(...transactions);

        this.log(`✅ Extracted ${transactions.length} transactions from table ${table.index + 1}`);

      } catch (error) {
        this.log(`❌ Error processing table ${table.index + 1}: ${error}`);
        continue;
      }
    }

    return allTransactions;
  }

  /**
   * Parse raw transaction data into Banesco transactions
   */
  protected parseTransactionData(rawData: string[][]): BanescoTransaction[] {
    const transactions: BanescoTransaction[] = [];

    for (const row of rawData) {
      if (row.length < 3) continue; // Skip incomplete rows

      try {
        // Banesco table structure is more flexible, so we need to be adaptive
        const dateString = this.findDateInRow(row);
        const amountString = this.findAmountInRow(row);
        const description = this.findDescriptionInRow(row);
        const dcValue = this.findDCValue(row);

        if (!dateString || !amountString) continue; // Skip rows without essential data

        const date = this.parseDate(dateString);
        const amount = this.parseAmount(amountString);
        const transactionType = this.determineTransactionType(dcValue);

        // Generate deterministic transaction ID from stable fields
        const stableKey = [
          date,
          String(Math.abs(this.parseAmount(amountString))),
          (description || 'Transacción').trim(),
          transactionType,
        ].join('|');
        const stableHash = createHash('sha256').update(stableKey).digest('hex').slice(0, 16);

        const transaction: BanescoTransaction = {
          id: `banesco-${stableHash}`,
          date,
          description: description || 'Transacción',
          amount: Math.abs(amount),
          type: transactionType,
          bankName: 'Banesco'
        };

        transactions.push(transaction);

      } catch (error) {
        this.log(`⚠️  Failed to parse transaction row: ${error}`);
        continue;
      }
    }

    return transactions;
  }

  /**
   * Find date in row (flexible approach)
   */
  private findDateInRow(row: string[]): string | null {
    for (const cell of row) {
      if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(cell)) {
        return cell;
      }
    }
    return null;
  }

  /**
   * Find amount in row (flexible approach)
   */
  private findAmountInRow(row: string[]): string | null {
    for (const cell of row) {
      if (/[\d\.,]+/.test(cell) && (cell.includes(',') || cell.includes('.'))) {
        return cell;
      }
    }
    return null;
  }

  /**
   * Find description in row (usually the longest text cell)
   */
  private findDescriptionInRow(row: string[]): string | null {
    let longestCell = '';
    for (const cell of row) {
      if (cell.length > longestCell.length && !this.findDateInRow([cell]) && !this.findAmountInRow([cell])) {
        longestCell = cell;
      }
    }
    return longestCell || null;
  }

  /**
   * Find D/C value (debit/credit indicator)
   */
  private findDCValue(row: string[]): string {
    for (const cell of row) {
      if (/^[DC]$/i.test(cell.trim())) {
        return cell.trim().toUpperCase();
      }
    }
    return '';
  }

  /**
   * Determine transaction type from D/C value
   */
  private determineTransactionType(dcValue: string): 'debit' | 'credit' {
    return dcValue === 'D' ? 'debit' : 'credit';
  }

  /**
   * Extract account summary information
   */
  private async extractAccountSummary(): Promise<{
    currentBalance: number | null;
    previousBalance: number | null;
    accountNumber: string | null;
    accountType: string | null;
  }> {
    try {
      const summary = await this.page.$$eval('*', elements => {
        const results = {
          currentBalance: null as number | null,
          previousBalance: null as number | null,
          accountNumber: null as string | null,
          accountType: null as string | null
        };

        elements.forEach(element => {
          const text = element.textContent?.trim() || '';
          
          // Look for balance patterns
          if (/saldo.*actual|balance.*current/i.test(text)) {
            const match = text.match(/[\d\.,]+/);
            if (match) {
              results.currentBalance = parseFloat(match[0].replace(/[,\.]/g, ''));
            }
          }
          
          // Look for account number patterns
          if (/cuenta.*n[úu]mero|account.*number/i.test(text)) {
            const match = text.match(/\d{10,}/);
            if (match) {
              results.accountNumber = match[0];
            }
          }
        });

        return results;
      });

      return summary;
      
    } catch (error) {
      this.log(`⚠️  Error extracting account summary: ${error}`);
      return {
        currentBalance: null,
        previousBalance: null,
        accountNumber: null,
        accountType: null
      };
    }
  }

  /**
   * Alternative data extraction method
   */
  private async alternativeDataExtraction(): Promise<BanescoScrapingResult> {
    this.log('🔄 Attempting alternative data extraction...');
    
    try {
      // Try to extract any text that looks like transaction data
      const possibleTransactions = await this.page.$$eval('*', elements => {
        const transactionData: string[][] = [];
        
        elements.forEach(element => {
          const text = element.textContent?.trim() || '';
          
          // Look for patterns that might be transaction data
          if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text) && 
              /[\d\.,]+/.test(text) && 
              text.length > 10) {
            // Split by common separators
            const parts = text.split(/\s+|\t+/).filter(part => part.trim());
            if (parts.length >= 3) {
              transactionData.push(parts);
            }
          }
        });
        
        return transactionData;
      });

      if (possibleTransactions.length > 0) {
        const transactions = this.parseTransactionData(possibleTransactions);
        
        return {
          success: true,
          message: `Alternative extraction found ${transactions.length} transactions`,
          data: transactions,
          timestamp: new Date(),
          bankName: 'Banesco',
          metadata: {
            extractionMethod: 'alternative',
            rawDataFound: possibleTransactions.length
          }
        };
      }
      
    } catch (error) {
      this.log(`❌ Alternative extraction failed: ${error}`);
    }

    return {
      success: true,
      message: 'No transactions found with alternative extraction',
      data: [],
      timestamp: new Date(),
      bankName: 'Banesco'
    };
  }
} 