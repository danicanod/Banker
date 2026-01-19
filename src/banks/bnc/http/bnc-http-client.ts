/**
 * BNC HTTP Client
 * 
 * Pure HTTP-based client for BNC online banking authentication and transaction scraping.
 * Uses cookie jar for session management and cheerio for HTML parsing.
 * 
 * Authentication flow:
 * 1. GET `/` - Load login page, extract __RequestVerificationToken
 * 2. POST `/Auth/PreLogin_Try` - Submit CardNumber + UserID
 * 3. POST `/Auth/Login_Try` - Submit UserPassword
 * 4. GET `/Home/BNCNETHB/Welcome` - Verify successful login
 * 
 * Transaction scraping:
 * - GET `/Accounts/Transactions/Last25` - Fetch and parse transaction table
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { 
  CookieFetch, 
  createCookieFetch,
  extractRequestVerificationToken
} from '../../../shared/utils/http-client.js';
import type { BncCredentials, BncTransaction, BncScrapingResult } from '../types/index.js';
import { BncAccountType } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface BncHttpConfig {
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom user agent */
  userAgent?: string;
  /** 
   * Attempt to logout before login to clear any existing session.
   * Useful when BNC reports "session already active" errors.
   * Default: true
   */
  logoutFirst?: boolean;
}

export interface BncHttpLoginResult {
  success: boolean;
  message: string;
  authenticated: boolean;
  error?: string;
}

export interface BncPreLoginResponse {
  /** Type 200 = success, other = error */
  Type: number;
  /** HTML content for the password form */
  Value?: string;
  /** Legacy fields (in case API changes) */
  Succeeded?: boolean;
  Content?: string;
  Token?: string;
  Message?: string;
}

export interface BncLoginResponse {
  /** Type 200 = success */
  Type: number;
  /** Return URL after successful login */
  Value?: string;
  /** Legacy fields */
  Succeeded?: boolean;
  ReturnUrl?: string;
  Message?: string;
}

// ============================================================================
// Constants
// ============================================================================

const BNC_HTTP_URLS = {
  BASE: 'https://personas.bncenlinea.com',
  LOGIN_PAGE: 'https://personas.bncenlinea.com/',
  PRE_LOGIN: 'https://personas.bncenlinea.com/Auth/PreLogin_Try',
  LOGIN: 'https://personas.bncenlinea.com/Auth/Login_Try',
  LOGOUT: 'https://personas.bncenlinea.com/Auth/LogOut',
  WELCOME: 'https://personas.bncenlinea.com/Home/BNCNETHB/Welcome',
  TRANSACTIONS_PAGE: 'https://personas.bncenlinea.com/Accounts/Transactions/Last25',
  // This is the AJAX endpoint that returns the actual transaction data!
  TRANSACTIONS_LIST: 'https://personas.bncenlinea.com/Accounts/Transactions/Last25_List'
};

// ============================================================================
// BNC HTTP Client
// ============================================================================

export class BncHttpClient {
  private credentials: BncCredentials;
  private config: Required<BncHttpConfig>;
  private httpClient: CookieFetch;
  private isAuthenticated: boolean = false;
  private currentToken: string | null = null;

  constructor(credentials: BncCredentials, config: BncHttpConfig = {}) {
    this.credentials = credentials;
    this.config = {
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      logoutFirst: config.logoutFirst ?? true
    };

    this.httpClient = createCookieFetch({
      timeout: this.config.timeout,
      debug: this.config.debug,
      userAgent: this.config.userAgent,
      acceptLanguage: 'es-VE'
    });

    this.log(`BncHttpClient initialized`);
    this.log(`   User ID: ${credentials.id.substring(0, 3)}***`);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Perform complete login flow
   */
  async login(): Promise<BncHttpLoginResult> {
    this.log('🚀 Starting BNC HTTP login...');
    const startTime = Date.now();

    try {
      // Step 0: Logout first to clear any existing session
      if (this.config.logoutFirst) {
        this.log('Step 0: Clearing any existing session...');
        await this.logout();
      }

      // Step 1: Load login page and get initial token
      this.log('Step 1: Loading login page...');
      const initialToken = await this.loadLoginPage();
      
      if (!initialToken) {
        throw new Error('Failed to extract __RequestVerificationToken from login page');
      }
      
      this.currentToken = initialToken;
      this.log(`   Got initial token (${initialToken.length} chars)`);

      // Step 2: Submit PreLogin (CardNumber + UserID)
      this.log('Step 2: Submitting PreLogin (card + user ID)...');
      const preLoginResult = await this.submitPreLogin();
      
      if (!preLoginResult.success) {
        throw new Error(preLoginResult.error || 'PreLogin failed');
      }
      
      this.log('   PreLogin successful');

      // Step 3: Submit Login (Password)
      this.log('Step 3: Submitting password...');
      const loginResult = await this.submitLogin();
      
      if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login failed');
      }
      
      this.log('   Password submitted');

      // Step 4: Verify authentication
      this.log('Step 4: Verifying authentication...');
      const verified = await this.verifyAuthentication();
      
      const elapsed = Date.now() - startTime;

      if (verified) {
        this.isAuthenticated = true;
        this.log(`Login successful in ${elapsed}ms`);
        
        return {
          success: true,
          message: `Authentication successful in ${elapsed}ms`,
          authenticated: true
        };
      } else {
        return {
          success: false,
          message: 'Authentication verification failed',
          authenticated: false,
          error: 'Could not verify login - may still be on login page'
        };
      }

    } catch (error: unknown) {
      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Login failed after ${elapsed}ms: ${message}`);
      
      return {
        success: false,
        message,
        authenticated: false,
        error: message
      };
    }
  }

  /**
   * Fetch Last 25 transactions for all accounts
   */
  async fetchLast25Transactions(): Promise<BncScrapingResult> {
    if (!this.isAuthenticated) {
      return {
        success: false,
        message: 'Not authenticated. Call login() first.',
        data: [],
        timestamp: new Date(),
        bankName: 'BNC',
        error: 'Not authenticated'
      };
    }

    this.log('Fetching Last25 transactions...');
    const startTime = Date.now();
    const allTransactions: BncTransaction[] = [];
    const accountsScraped: string[] = [];
    const errors: string[] = [];

    // Dynamically discover accounts from the dropdown
    const accounts = await this.discoverAccounts();
    
    if (accounts.length === 0) {
      this.log('⚠️  No accounts found in dropdown');
      return {
        success: true,
        message: 'No accounts found',
        data: [],
        timestamp: new Date(),
        bankName: 'BNC',
        accountsFound: 0,
        transactionsExtracted: 0
      };
    }

    for (const account of accounts) {
      try {
        this.log(`💰 Fetching transactions for ${account.label}...`);
        
        const transactions = await this.fetchAccountTransactionsWithValue(account.value, account.accountId || account.label);
        
        if (transactions.length > 0) {
          allTransactions.push(...transactions);
          accountsScraped.push(account.label);
          this.log(`   ✅ Got ${transactions.length} transactions from ${account.label}`);
        } else {
          this.log(`   ⚠️  No transactions for ${account.label}`);
        }

      } catch (error: any) {
        const errorMsg = `Failed to fetch ${account.label}: ${error.message}`;
        this.log(`   ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const elapsed = Date.now() - startTime;
    this.log(`🎉 Fetched ${allTransactions.length} transactions from ${accountsScraped.length} accounts in ${elapsed}ms`);

    return {
      success: true,
      message: `Successfully scraped ${allTransactions.length} transactions from ${accountsScraped.length} accounts`,
      data: allTransactions,
      timestamp: new Date(),
      bankName: 'BNC',
      accountsFound: accountsScraped.length,
      transactionsExtracted: allTransactions.length,
      metadata: {
        accountsScraped,
        errors: errors.length > 0 ? errors : undefined
      }
    };
  }
  
  /**
   * Discover available accounts from the transactions page dropdown
   */
  private async discoverAccounts(): Promise<Array<{ value: string; label: string; accountId?: string }>> {
    const pageHtml = await this.httpClient.getHtml(BNC_HTTP_URLS.TRANSACTIONS_PAGE, {
      'Referer': BNC_HTTP_URLS.WELCOME
    });

    const $ = cheerio.load(pageHtml);
    const accountSelect = $('#Frm_Accounts select[name="Account"], select#Account');
    const accounts: Array<{ value: string; label: string; accountId?: string }> = [];
    
    accountSelect.find('option').each((_, el) => {
      const value = $(el).attr('value');
      const label = $(el).text().trim();
      
      if (value && value !== '0') {  // Skip the "-- Seleccione --" option
        // Try to extract account number from label (e.g., "Cuenta Corriente - 0123456789")
        const accountNumberMatch = label.match(/\b(\d{10,20})\b/);
        const accountId = accountNumberMatch ? accountNumberMatch[1] : undefined;
        
        accounts.push({ value, label, accountId });
        this.log(`   Discovered account: ${label} (accountId: ${accountId || 'N/A'})`);
      }
    });
    
    return accounts;
  }
  
  /**
   * Fetch transactions for a specific account using its dropdown value
   */
  private async fetchAccountTransactionsWithValue(accountValue: string, accountName: string): Promise<BncTransaction[]> {
    const pageHtml = await this.httpClient.getHtml(BNC_HTTP_URLS.TRANSACTIONS_PAGE, {
      'Referer': BNC_HTTP_URLS.WELCOME
    });

    const $ = cheerio.load(pageHtml);
    const token = extractRequestVerificationToken(pageHtml);
    
    const formData: Record<string, string> = {};
    
    if (token) {
      formData['__RequestVerificationToken'] = token;
    }
    
    $('#Frm_Accounts input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      const value = $(el).attr('value') || '';
      if (name && name !== '__RequestVerificationToken') {
        formData[name] = value;
      }
    });
    
    formData['Account'] = accountValue;

    try {
      const result = await this.httpClient.postForm(BNC_HTTP_URLS.TRANSACTIONS_LIST, formData, {
        'Referer': BNC_HTTP_URLS.TRANSACTIONS_PAGE,
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      });
      
      try {
        const jsonResponse = JSON.parse(result.html);
        
        if (jsonResponse.Type === 200 && jsonResponse.Value) {
          return this.parseTransactionsHtml(jsonResponse.Value, accountName);
        } else if (jsonResponse.Type === 300 || jsonResponse.Type === 350 || jsonResponse.Type === 500) {
          return [];
        } else if (jsonResponse.Type === 505) {
          this.isAuthenticated = false;
          return [];
        }
      } catch {
        if (result.html.includes('Tbl_Transactions')) {
          return this.parseTransactionsHtml(result.html, accountName);
        }
      }
      
    } catch (error: any) {
      this.log(`   POST to transactions list failed: ${error.message}`);
    }

    return [];
  }

  /**
   * Check if currently authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Logout from BNC (clears server-side session)
   * Call this before login if you suspect there's an existing session
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    this.log('🚪 Attempting logout...');
    
    try {
      // Hit the logout endpoint to clear server-side session
      const html = await this.httpClient.getHtml(BNC_HTTP_URLS.LOGOUT, {
        'Referer': BNC_HTTP_URLS.WELCOME
      });
      
      // Check if we're back on login page (successful logout)
      const backOnLogin = html.includes('CardNumber') || html.includes('UserID') || html.includes('Frm_Login');
      
      // Reset local state
      this.isAuthenticated = false;
      this.currentToken = null;
      await this.httpClient.clearCookies();
      
      if (backOnLogin) {
        this.log('Logout successful - redirected to login page');
        return { success: true, message: 'Logged out successfully' };
      } else {
        this.log(' Logout endpoint hit but response unclear');
        return { success: true, message: 'Logout request sent (response unclear)' };
      }
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(` Logout error: ${message}`);
      // Still reset local state even if request failed
      this.isAuthenticated = false;
      this.currentToken = null;
      await this.httpClient.clearCookies();
      return { success: false, message };
    }
  }

  /**
   * Reset client state
   */
  async reset(): Promise<void> {
    this.isAuthenticated = false;
    this.currentToken = null;
    await this.httpClient.clearCookies();
    this.log('🔄 Client reset');
  }

  // ==========================================================================
  // Internal: Login Flow
  // ==========================================================================

  private async loadLoginPage(): Promise<string | null> {
    const html = await this.httpClient.getHtml(BNC_HTTP_URLS.LOGIN_PAGE);
    this.log(`   Got login page (${html.length} chars)`);
    
    const token = extractRequestVerificationToken(html);
    return token;
  }

  private async submitPreLogin(): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.currentToken) {
      return { success: false, error: 'No token available' };
    }

    const formData = {
      '__RequestVerificationToken': this.currentToken,
      'prv_LoginType': 'NATURAL',
      'prv_InnerLoginType': '1',
      'CardNumber': this.credentials.card,
      'UserID': this.credentials.id
    };

    const result = await this.httpClient.postForm(BNC_HTTP_URLS.PRE_LOGIN, formData, {
      'Referer': BNC_HTTP_URLS.LOGIN_PAGE,
      'Accept': '*/*',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    });

    this.log(`   PreLogin response (${result.html.length} chars): ${result.html.substring(0, 300)}...`);

    // Parse JSON response
    try {
      const response = JSON.parse(result.html) as BncPreLoginResponse;
      
      // BNC uses Type: 200 for success, Value contains HTML
      const isSuccess = response.Type === 200 || response.Succeeded === true;
      const htmlContent = response.Value || response.Content;
      
      this.log(`   PreLogin JSON: Type=${response.Type}, HasValue=${!!response.Value}, Message=${response.Message || 'none'}`);
      
      if (isSuccess) {
        // Extract new token from the returned HTML content
        if (htmlContent) {
          const newToken = extractRequestVerificationToken(htmlContent);
          if (newToken) {
            this.currentToken = newToken;
            this.log(`   Updated token from PreLogin response`);
          } else {
            this.log(`    No token found in Value/Content, looking for password field...`);
            // Check if we got the password form
            if (htmlContent.includes('UserPassword')) {
              this.log(`   Password form detected`);
            }
          }
        }
        return { success: true };
      } else {
        return { success: false, error: response.Message || `PreLogin failed with Type: ${response.Type}` };
      }
    } catch (e) {
      this.log(`   PreLogin JSON parse error: ${e}`);
      
      // If not JSON, check for redirect or error
      if (result.response.status === 200 && result.html.includes('UserPassword')) {
        // We got the password form - extract new token
        const newToken = extractRequestVerificationToken(result.html);
        if (newToken) {
          this.currentToken = newToken;
        }
        return { success: true };
      }
      
      return { success: false, error: `Unexpected response: ${result.html.substring(0, 200)}` };
    }
  }

  private async submitLogin(): Promise<{ success: boolean; redirectUrl?: string; error?: string }> {
    if (!this.currentToken) {
      return { success: false, error: 'No token available' };
    }

    const formData = {
      '__RequestVerificationToken': this.currentToken,
      'prv_InnerLoginType': '1',
      'UserPassword': this.credentials.password
    };

    const result = await this.httpClient.postForm(BNC_HTTP_URLS.LOGIN, formData, {
      'Referer': BNC_HTTP_URLS.LOGIN_PAGE,
      'Accept': '*/*',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    });

    this.log(`   Login response (${result.html.length} chars): ${result.html.substring(0, 200)}...`);

    // Parse JSON response
    try {
      const response = JSON.parse(result.html) as BncLoginResponse;
      
      // BNC uses Type: 200 for success, 500 for errors
      const isSuccess = response.Type === 200 || response.Succeeded === true;
      const redirectUrl = response.Value || response.ReturnUrl;
      
      this.log(`   Login JSON: Type=${response.Type}, Value=${(response.Value || 'none').substring(0, 100)}`);
      
      if (isSuccess) {
        return { success: true, redirectUrl };
      } else {
        // Try to extract error message from HTML response
        let errorMessage = response.Message;
        
        if (!errorMessage && response.Value) {
          // Look for error message in the returned HTML
          const $ = cheerio.load(response.Value);
          const errorLabel = $('#LblMessage').text().trim();
          if (errorLabel) {
            errorMessage = errorLabel;
          }
          
          // Also check for "session already active" message pattern
          if (response.Value.includes('sesión previa activa')) {
            errorMessage = 'Existe una sesión previa activa, la nueva sesión ha sido denegada';
          }
        }
        
        return { success: false, error: errorMessage || `Login failed with Type: ${response.Type}` };
      }
    } catch (e) {
      this.log(`   Login JSON parse error: ${e}`);
      
      // Check for redirect
      if (result.location) {
        return { success: true, redirectUrl: result.location };
      }
      
      // If response is HTML, might still be successful
      if (result.response.status === 200) {
        return { success: true };
      }
      
      return { success: false, error: `Unexpected response status: ${result.response.status}` };
    }
  }

  private async verifyAuthentication(): Promise<boolean> {
    try {
      const html = await this.httpClient.getHtml(BNC_HTTP_URLS.WELCOME, {
        'Referer': BNC_HTTP_URLS.LOGIN_PAGE
      });

      // Check for indicators of successful login
      const $ = cheerio.load(html);
      
      // Look for logout button
      const hasLogout = $('#btn-logout').length > 0 || html.includes('btn-logout');
      
      // Look for welcome message or dashboard elements
      const hasWelcome = html.includes('Bienvenido') || html.includes('BNCNETHB');
      
      // Check we're not still on login page
      const notOnLogin = !html.includes('CardNumber') || !html.includes('UserID');

      if (hasLogout || hasWelcome) {
        return true;
      }

      if (notOnLogin && html.length > 5000) {
        // Seems like we got past login
        return true;
      }

      this.log(`    Verification uncertain - hasLogout: ${hasLogout}, hasWelcome: ${hasWelcome}`);
      return false;

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`   Verification error: ${message}`);
      return false;
    }
  }

  // ==========================================================================
  // Internal: Transaction Fetching
  // ==========================================================================

  private async fetchAccountTransactions(accountIndex: number, accountName: string): Promise<BncTransaction[]> {
    // BNC uses AJAX to load transactions via POST to /Accounts/Transactions/Last25_List
    // The form #Frm_Accounts is serialized and sent
    // Key insight: The select field is named "Account" and values are encrypted hex strings
    
    // First, load the transactions page to get the CSRF token and form structure
    const pageHtml = await this.httpClient.getHtml(BNC_HTTP_URLS.TRANSACTIONS_PAGE, {
      'Referer': BNC_HTTP_URLS.WELCOME
    });

    // Extract token and form fields from the page
    const $ = cheerio.load(pageHtml);
    const token = extractRequestVerificationToken(pageHtml);
    
    if (!token) {
      this.log(`    No token found on transactions page`);
    }
    
    // Log what's on the page for debugging
    const hasForm = $('#Frm_Accounts').length > 0;
    // The select is named "Account", not "ddlAccounts"!
    const accountSelect = $('#Frm_Accounts select[name="Account"], select#Account');
    const hasAccountSelect = accountSelect.length > 0;
    this.log(`   Page has #Frm_Accounts: ${hasForm}, has select Account: ${hasAccountSelect}`);
    
    // Extract all form fields from #Frm_Accounts
    const formData: Record<string, string> = {};
    
    // Add CSRF token from the form (not the one from login)
    if (token) {
      formData['__RequestVerificationToken'] = token;
    }
    
    // Extract hidden fields from the form
    $('#Frm_Accounts input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      const value = $(el).attr('value') || '';
      if (name && name !== '__RequestVerificationToken') {  // Don't override token
        formData[name] = value;
        this.log(`   Hidden field: ${name}=${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
      }
    });
    
    // Get account options from select dropdown
    // BNC uses encrypted hex strings as account values, not simple indices!
    // Example: "0x02000000FA96288046229F90134100880C54DD08..."
    const accountValues: string[] = [];
    if (hasAccountSelect) {
      accountSelect.find('option').each((_, el) => {
        const val = $(el).attr('value');
        const text = $(el).text().trim();
        if (val && val !== '0') {  // Skip the "-- Seleccione --" option (value="0")
          accountValues.push(val);
          this.log(`   Account option: ${text.substring(0, 40)}... → ${val.substring(0, 30)}...`);
        }
      });
    }
    
    // Set the selected account using the actual hex value from the options
    // accountIndex is 1-based, so accountValues[0] = account 1, etc.
    const selectedAccountValue = accountValues[accountIndex - 1];
    if (!selectedAccountValue) {
      this.log(`    No account found at index ${accountIndex} (available: ${accountValues.length})`);
      return [];
    }
    
    // The form field is "Account", not "ddlAccounts"!
    formData['Account'] = selectedAccountValue;
    
    this.log(`   Sending ${Object.keys(formData).length} form fields with Account=${selectedAccountValue.substring(0, 30)}...`);

    // POST to the AJAX endpoint that returns transaction HTML
    try {
      const result = await this.httpClient.postForm(BNC_HTTP_URLS.TRANSACTIONS_LIST, formData, {
        'Referer': BNC_HTTP_URLS.TRANSACTIONS_PAGE,
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      });
      
      this.log(`   Got response (${result.html.length} chars): ${result.html.substring(0, 300)}`);
      
      // The response is JSON with Type and Value (HTML content)
      try {
        const jsonResponse = JSON.parse(result.html);
        
        this.log(`   Response Type: ${jsonResponse.Type}, Message: ${jsonResponse.Message || 'none'}`);
        
        if (jsonResponse.Type === 200 && jsonResponse.Value) {
          // Value contains the HTML with the transaction table
          return this.parseTransactionsHtml(jsonResponse.Value, accountName);
        } else if (jsonResponse.Type === 300) {
          // Type 300 = no transactions found (based on Transactions.js code)
          this.log(`   No transactions found (Type 300)`);
          return [];
        } else if (jsonResponse.Type === 350) {
          // Type 350 = error message (from Transactions.js code)
          this.log(`   Error response: ${jsonResponse.Value || jsonResponse.Message}`);
          return [];
        } else if (jsonResponse.Type === 500) {
          // Type 500 = server error or invalid request
          this.log(`   Server error (Type 500): ${jsonResponse.Value || jsonResponse.Message || 'unknown'}`);
          return [];
        } else if (jsonResponse.Type === 505) {
          // Session expired
          this.log(`   Session expired (Type 505)`);
          this.isAuthenticated = false;
          return [];
        }
      } catch {
        // Not JSON - maybe direct HTML?
        if (result.html.includes('Tbl_Transactions')) {
          return this.parseTransactionsHtml(result.html, accountName);
        }
      }
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`   POST to transactions list failed: ${message}`);
    }

    return [];
  }

  /**
   * Parse transactions from HTML table
   */
  parseTransactionsHtml(html: string, accountName: string = ''): BncTransaction[] {
    const $ = cheerio.load(html);
    const transactions: BncTransaction[] = [];

    // Find the transactions table
    const table = $('#Tbl_Transactions');
    
    if (table.length === 0) {
      this.log(`    No transaction table found`);
      return [];
    }

    // Parse each row
    table.find('tbody tr.cursor-pointer').each((_, row) => {
      try {
        const cells = $(row).find('td');
        
        if (cells.length < 4) return;

        const dateStr = $(cells[0]).text().trim();
        const typeStr = $(cells[1]).text().trim();
        const reference = $(cells[2]).text().trim();
        const amountStr = $(cells[3]).text().trim();

        // Try to get description/memo from the next row (BNC uses collapsible detail rows)
        const nextRow = $(row).next('tr');
        let description = '';
        
        if (nextRow.length > 0) {
          // Try multiple selectors for the memo/description text
          description = nextRow.find('.font-size-custom').first().text().trim()
            || nextRow.find('.collapse').text().trim()
            || nextRow.find('div').first().text().trim()
            || nextRow.find('td').text().trim();
        }

        // Parse date (format: DD/MM/YYYY or similar)
        const date = this.parseDate(dateStr);
        
        // Parse amount and determine type
        const amount = this.parseAmount(amountStr);
        const transactionType = this.determineTransactionType(amountStr, typeStr);

        // Generate deterministic transaction ID using hash of stable fields
        // This ensures idempotency in Convex even if references are missing/duplicated
        const stableKey = [
          date,
          String(Math.abs(amount)),
          reference,
          description || typeStr,
          transactionType,
          accountName
        ].join('|');
        const txnId = `bnc-${createHash('sha256').update(stableKey).digest('hex').slice(0, 16)}`;

        const transaction: BncTransaction = {
          id: txnId,
          date,
          description: description || typeStr,
          amount: Math.abs(amount),
          type: transactionType,
          reference,
          bankName: 'BNC',
          transactionType: typeStr,
          referenceNumber: reference,
          accountName
        };

        transactions.push(transaction);

      } catch {
        // Skip malformed rows
      }
    });

    return transactions;
  }

  // ==========================================================================
  // Internal: Parsing Utilities
  // ==========================================================================

  private parseDate(dateString: string): string {
    // Handle various date formats
    const cleanDate = dateString.trim();
    
    // Try DD/MM/YYYY
    const slashMatch = cleanDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (slashMatch) {
      const [, day, month, year] = slashMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try DD-MM-YYYY
    const dashMatch = cleanDate.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
    if (dashMatch) {
      const [, day, month, year] = dashMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return dateString;
  }

  private parseAmount(amountString: string): number {
    // Remove currency symbols and spaces
    let clean = amountString.replace(/[^\d,.-]/g, '').trim();
    
    // Handle Venezuelan format: 1.234,56 (dots for thousands, comma for decimals)
    // Check if comma appears after last dot (Venezuelan format)
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    
    if (lastComma > lastDot) {
      // Venezuelan format: remove dots, replace comma with dot
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      // US format: just remove commas
      clean = clean.replace(/,/g, '');
    }

    return parseFloat(clean) || 0;
  }

  private determineTransactionType(amountString: string, typeString: string): 'debit' | 'credit' {
    // Check amount string for negative indicator
    if (amountString.includes('-')) {
      return 'debit';
    }
    
    // Check type string for common patterns
    const lowerType = typeString.toLowerCase();
    const debitPatterns = ['débito', 'debito', 'cargo', 'retiro', 'pago', 'transferencia enviada'];
    const creditPatterns = ['crédito', 'credito', 'abono', 'depósito', 'deposito', 'transferencia recibida'];
    
    for (const pattern of debitPatterns) {
      if (lowerType.includes(pattern)) {
        return 'debit';
      }
    }
    
    for (const pattern of creditPatterns) {
      if (lowerType.includes(pattern)) {
        return 'credit';
      }
    }

    // Default to credit for positive amounts
    return 'credit';
  }

  // ==========================================================================
  // Internal: Logging
  // ==========================================================================

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[BncHTTP] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a BNC HTTP client
 */
export function createBncHttpClient(
  credentials: BncCredentials,
  config?: BncHttpConfig
): BncHttpClient {
  return new BncHttpClient(credentials, config);
}

/**
 * Quick login function for simple use cases
 */
export async function quickHttpLogin(
  credentials: BncCredentials,
  config?: BncHttpConfig
): Promise<BncHttpLoginResult> {
  const client = createBncHttpClient(credentials, config);
  return client.login();
}
