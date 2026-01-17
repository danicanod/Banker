/**
 * BNC Transactions Scraper with Playwright
 * 
 * This module provides transaction scraping functionality for BNC online banking
 * using the BaseBankScraper abstract class with BNC-specific implementation.
 */

import { Page } from 'playwright';
import type { BncTransaction, BncScrapingConfig, BncScrapingResult } from '../types/index.js';
import { BNC_URLS, BNC_SELECTORS, BncAccountType } from '../types/index.js';
import { BaseBankScraper } from '../../../shared/index.js';

export class BncTransactionsScraper extends BaseBankScraper<
  BncTransaction,
  BncScrapingConfig,
  BncScrapingResult
> {
  constructor(page: Page, config: BncScrapingConfig = {}) {
    super('BNC', page, config);
  }

  /**
   * Get default configuration with BNC-specific defaults
   */
  protected getDefaultConfig(config: BncScrapingConfig): Required<BncScrapingConfig> {
    return {
      debug: false,
      timeout: 30000,
      waitBetweenActions: 1000,
      retries: 3,
      saveHtml: false,
      maxAccounts: 3,  // BNC-specific default
      ...config
    } as Required<BncScrapingConfig>;
  }

  /**
   * Get BNC transactions URL
   */
  protected getScrapingUrl(): string {
    return BNC_URLS.TRANSACTIONS;
  }

  /**
   * Get BNC-specific selectors
   */
  protected getSelectors(): Record<string, string> {
    return {
      filterButton: BNC_SELECTORS.FILTER_BUTTON,
      searchButton: BNC_SELECTORS.SEARCH_BUTTON,
      dropdownIcon: BNC_SELECTORS.DROPDOWN_ICON,
      transactionDate: BNC_SELECTORS.TRANSACTION_DATE,
      transactionType: BNC_SELECTORS.TRANSACTION_TYPE,
      transactionReference: BNC_SELECTORS.TRANSACTION_REFERENCE,
      transactionAmount: BNC_SELECTORS.TRANSACTION_AMOUNT,
      transactionDescription: BNC_SELECTORS.TRANSACTION_DESCRIPTION
    };
  }

  /**
   * Main scraping method - implements BNC-specific transaction extraction
   */
  async scrapeTransactions(): Promise<BncScrapingResult> {
    this.log('🚀 Starting BNC transactions scraping...');
    
    const allTransactions: BncTransaction[] = [];
    const accountsScraped: string[] = [];
    const errors: string[] = [];

    try {
      // Navigate to transactions page using base method
      const navigated = await this.navigateToScrapingPage();
      if (!navigated) {
        throw new Error('Failed to navigate to transactions page');
      }

      await this.debugPause('Transactions page loaded - ready to scrape accounts');

      // Iterate through all 3 account types
      const accountTypes = [
        { index: 1, name: BncAccountType.VES_1109 },
        { index: 2, name: BncAccountType.USD_0816 },
        { index: 3, name: BncAccountType.USD_0801 }
      ];

      for (const account of accountTypes.slice(0, this.config.maxAccounts)) {
        try {
          this.log(`💰 Processing account: ${account.name} (index: ${account.index})`);
          
          const accountTransactions = await this.scrapeAccountTransactions(account.index, account.name);
          
          if (accountTransactions.length > 0) {
            allTransactions.push(...accountTransactions);
            accountsScraped.push(account.name);
            this.log(`✅ Successfully scraped ${accountTransactions.length} transactions from ${account.name}`);
          } else {
            this.log(`⚠️  No transactions found for ${account.name}`);
          }

          // Wait between accounts using base method
          await this.page.waitForTimeout(this.config.waitBetweenActions);

        } catch (error: any) {
          const errorMessage = `Failed to scrape ${account.name}: ${error.message}`;
          this.log(`❌ ${errorMessage}`);
          errors.push(errorMessage);
          
          // Continue with next account
          continue;
        }
      }

      await this.debugPause(`All accounts processed - found ${allTransactions.length} total transactions`);

      this.log(`🎉 Scraping completed: ${allTransactions.length} transactions from ${accountsScraped.length} accounts`);

      return {
        success: true,
        message: `Successfully scraped ${allTransactions.length} transactions from ${accountsScraped.length} accounts`,
        data: allTransactions,
        timestamp: new Date(),
        bankName: 'BNC',
        accountsFound: accountsScraped.length,
        transactionsExtracted: allTransactions.length,
        sessionInfo: {
          loginTime: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        },
        metadata: {
          accountsScraped,
          errors: errors.length > 0 ? errors : undefined
        }
      };

    } catch (error: any) {
      this.log(`💥 Fatal error during scraping: ${error.message}`);
      
      return {
        success: false,
        message: `Scraping failed: ${error.message}`,
        data: allTransactions,
        timestamp: new Date(),
        error: error.message,
        bankName: 'BNC',
        accountsFound: accountsScraped.length,
        transactionsExtracted: allTransactions.length,
        metadata: {
          accountsScraped,
          errors: [error.message, ...errors]
        }
      };
    }
  }

  /**
   * Scrape transactions for a specific account
   */
  private async scrapeAccountTransactions(accountIndex: number, accountName: string): Promise<BncTransaction[]> {
    this.log(`🔍 Scraping transactions for ${accountName}...`);

    try {
      // Navigate to transactions page (refresh to ensure clean state)
      await this.page.goto(this.getScrapingUrl(), {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });

      // Click on the filter button using base method
      this.log('🔘 Opening account filter...');
      const filterClicked = await this.clickElementWithRetry(this.getSelectors().filterButton);
      if (!filterClicked) {
        throw new Error('Failed to click filter button');
      }
      
      // Wait for dropdown to be visible
      await this.page.waitForTimeout(1000);

      // Select the specific account
      this.log(`🎯 Selecting account: ${accountName} (index: ${accountIndex})`);
      const accountSelector = `#bs-select-1-${accountIndex}`;
      
      const accountSelected = await this.clickElementWithRetry(accountSelector, 2);
      if (!accountSelected) {
        throw new Error(`Failed to select account: ${accountName}`);
      }

      // Click search button using base method
      this.log('🔍 Clicking search button...');
      const searchClicked = await this.clickElementWithRetry(this.getSelectors().searchButton);
      if (!searchClicked) {
        throw new Error('Failed to click search button');
      }

      // Wait for results to load
      await this.page.waitForTimeout(3000);

      // Expand all transaction details first
      await this.expandAllTransactionDetails();

      // Extract transaction data using base method and custom parsing
      const { headers, rows } = await this.extractTableData('#Tbl_Transactions');
      
      if (rows.length === 0) {
        this.log(`ℹ️  No transactions found in table for ${accountName}`);
        return [];
      }

      // Parse transactions using base parsing
      const transactions = this.parseTransactionData(rows);
      
      // Add account-specific information
      const enrichedTransactions = transactions.map(transaction => ({
        ...transaction,
        bankName: 'BNC' as const,
        accountName
      }));

      this.log(`✅ Extracted ${enrichedTransactions.length} transactions from ${accountName}`);
      return enrichedTransactions;

    } catch (error: any) {
      this.log(`❌ Error scraping ${accountName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Expand all transaction details
   */
  private async expandAllTransactionDetails(): Promise<void> {
    try {
      this.log('📖 Expanding all transaction details...');
      
      const dropdownIcons = await this.page.$$(this.getSelectors().dropdownIcon);
      this.log(`Found ${dropdownIcons.length} dropdown icons to expand`);
      
      for (let i = 0; i < dropdownIcons.length; i++) {
        try {
          await dropdownIcons[i].click();
          await this.page.waitForTimeout(200); // Small delay between clicks
        } catch (error) {
          this.log(`⚠️  Failed to click dropdown ${i + 1}: ${error}`);
        }
      }
      
      this.log('✅ All transaction details expanded');
      
    } catch (error) {
      this.log(`⚠️  Error expanding transaction details: ${error}`);
    }
  }

  /**
   * Parse raw transaction data into BNC transactions
   */
  protected parseTransactionData(rawData: string[][]): BncTransaction[] {
    const transactions: BncTransaction[] = [];

    for (const row of rawData) {
      if (row.length < 4) continue; // Skip incomplete rows

      try {
        const date = this.parseDate(row[0] || '');
        const type = row[1] || '';
        const reference = row[2] || '';
        const amountString = row[3] || '';
        const description = row[4] || '';

        const amount = this.parseAmount(amountString);
        const transactionType = this.determineTransactionType(amountString);

        const transaction: BncTransaction = {
          id: `bnc-${reference}-${date}`,
          date,
          description: description || type,
          amount: Math.abs(amount),
          type: transactionType,
          balance: 0, // BNC doesn't provide running balance in this view
          bankName: 'BNC',
          transactionType: type,
          referenceNumber: reference
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
   * Determine transaction type from amount string
   */
  private determineTransactionType(amountString: string): 'debit' | 'credit' {
    return amountString.includes('-') ? 'debit' : 'credit';
  }

  /**
   * Determine currency from account name
   */
  private determineCurrency(accountName: string): string {
    if (accountName.includes('USD')) {
      return 'USD';
    }
    return 'VES';
  }
} 