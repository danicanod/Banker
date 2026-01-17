/**
 * Banesco HTTP Client
 * 
 * ⚠️ IMPORTANT: Pure HTTP authentication is NOT POSSIBLE for Banesco.
 * 
 * Investigation confirmed (Jan 2026) that the Banesco site uses JavaScript-based
 * cookie establishment and anti-bot detection. The server returns a shell page
 * instead of the actual login form when accessed via pure HTTP without browser
 * context. This is a hard blocker with no known workaround.
 * 
 * This client provides:
 * 1. HTTP-based scraping AFTER Playwright authentication (~10x faster than browser)
 * 2. Utility functions for parsing Banesco pages with Cheerio
 * 3. Cookie-based session management for authenticated requests
 * 
 * REQUIRED APPROACH - Hybrid Mode:
 * ```typescript
 * // Step 1: Login with Playwright (REQUIRED - handles JS, iframes, security questions)
 * const auth = new BanescoAuth(credentials);
 * const loginResult = await auth.login();
 * 
 * // Step 2: Extract cookies from Playwright session
 * const cookies = await auth.getPage()?.context().cookies();
 * 
 * // Step 3: Use HTTP client for fast data fetching (after Playwright login)
 * const httpClient = new BanescoHttpClient(credentials, { cookies, skipLogin: true });
 * httpClient.importCookiesFromPlaywright(cookies);
 * const accounts = await httpClient.getAccounts();
 * const movements = await httpClient.getAccountMovements(accounts[0].accountNumber);
 * ```
 * 
 * The login() method exists for debugging/testing but will NOT succeed without
 * JavaScript-established cookies from a browser context.
 */

import * as cheerio from 'cheerio';
import {
  parseLoginPage,
  parseSecurityQuestionsPage,
  parsePasswordPage,
  parseDashboardPage,
  parseTransactionsTable,
  parseCookies,
  serializeCookies,
  buildHuella,
  parseAspNetFormFields,
  parseAllHiddenFields,
  findBestTransactionPostBack,
  buildPostBackFormData,
  parseAccountsFromDashboard,
  parseMovementsTable,
  type AspNetFormFields,
  type PostBackAction
} from './form-parser.js';

// ============================================================================
// Types
// ============================================================================

export interface BanescoHttpCredentials {
  username: string;
  password: string;
  securityQuestions: string; // Format: "keyword1:answer1,keyword2:answer2"
}

export interface BanescoHttpConfig {
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom user agent */
  userAgent?: string;
  /** Pre-set cookies (e.g., from Playwright session) */
  cookies?: Map<string, string> | Record<string, string>;
  /** Skip login attempt and use provided cookies directly */
  skipLogin?: boolean;
}

export interface BanescoHttpLoginResult {
  success: boolean;
  message: string;
  authenticated: boolean;
  cookies?: Map<string, string>;
  dashboardUrl?: string;
  error?: string;
}

export interface BanescoHttpTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  balance?: number;
  reference?: string;
}

export interface BanescoHttpScrapingResult {
  success: boolean;
  message: string;
  transactions: BanescoHttpTransaction[];
  error?: string;
}

export interface BanescoHttpAccount {
  /** Account type (e.g., "Cuenta Corriente", "Cuenta Verde") */
  type: string;
  /** Account number */
  accountNumber: string;
  /** Available balance */
  balance: number;
  /** Currency (VES, USD, etc.) */
  currency: string;
  /** Postback target for navigating to this account's details */
  postbackTarget?: string;
  /** Postback argument */
  postbackArg?: string;
}

export interface BanescoAccountsResult {
  success: boolean;
  message: string;
  accounts: BanescoHttpAccount[];
  error?: string;
}

export interface BanescoMovementsResult {
  success: boolean;
  message: string;
  accountNumber: string;
  transactions: BanescoHttpTransaction[];
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const BANESCO_URLS = {
  BASE: 'https://www.banesconline.com',
  // Main login page (contains the iframe)
  LOGIN_PAGE: 'https://www.banesconline.com/mantis/Website/Login.aspx',
  // Iframe content URLs - need proper Referer from Login.aspx
  LOGIN_IFRAME_INICIO: 'https://www.banesconline.com/mantis/Website/CAU/inicio/inicio.aspx?svc=mantis&Banco=01',
  LOGIN_IFRAME_FORM: 'https://www.banesconline.com/mantis/Website/CAU/inicio/LoginDNA.aspx?svc=mantis',
  SECURITY_QUESTIONS: 'https://www.banesconline.com/mantis/Website/CAU/Inicio/AU_ValDNA.aspx',
  PASSWORD: 'https://www.banesconline.com/mantis/Website/CAU/Inicio/ContrasenaDNA.aspx?svc=mantis',
  DASHBOARD: 'https://www.banesconline.com/Mantis/WebSite/Default.aspx',
  // Consultas pages (direct URLs for faster navigation)
  CONSULTAS_CUENTAS: 'https://www.banesconline.com/Mantis/WebSite/Cuentas/ConsultaCuentas.aspx',
  // Note: The actual movements page is MovimientosCuenta.aspx under consultamovimientoscuenta folder
  MOVIMIENTOS_CUENTA: 'https://www.banesconline.com/Mantis/WebSite/consultamovimientoscuenta/MovimientosCuenta.aspx'
};

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================================
// Main Client
// ============================================================================

export class BanescoHttpClient {
  private credentials: BanescoHttpCredentials;
  private config: {
    timeout: number;
    debug: boolean;
    userAgent: string;
    cookies?: Map<string, string> | Record<string, string>;
    skipLogin: boolean;
  };
  private cookies: Map<string, string> = new Map();
  private isAuthenticated: boolean = false;
  private securityQuestionsMap: Map<string, string>;

  constructor(credentials: BanescoHttpCredentials, config: BanescoHttpConfig = {}) {
    this.credentials = credentials;
    this.config = {
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
      cookies: config.cookies ?? undefined,
      skipLogin: config.skipLogin ?? false
    };
    
    this.securityQuestionsMap = this.parseSecurityQuestions(credentials.securityQuestions);
    
    // Import pre-set cookies if provided
    if (config.cookies) {
      if (config.cookies instanceof Map) {
        config.cookies.forEach((value, name) => this.cookies.set(name, value));
      } else {
        Object.entries(config.cookies).forEach(([name, value]) => this.cookies.set(name, value));
      }
      this.isAuthenticated = config.skipLogin ?? false;
      this.log(`🏦 BanescoHttpClient initialized with ${this.cookies.size} pre-set cookies`);
    } else {
      this.log(`🏦 BanescoHttpClient initialized`);
    }
    
    this.log(`   Username: ${credentials.username.substring(0, 3)}***`);
    this.log(`   Security questions: ${this.securityQuestionsMap.size} configured`);
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Perform complete login flow
   * 
   * ⚠️ THIS METHOD IS NOT SUPPORTED FOR BANESCO.
   * 
   * Pure HTTP login does NOT work for Banesco. The site uses JavaScript-based
   * cookie establishment and anti-bot detection. The server returns a shell page
   * instead of the login form when accessed via pure HTTP.
   * 
   * USE THE HYBRID APPROACH INSTEAD:
   * 1. Login with Playwright: `const auth = new BanescoAuth(credentials); await auth.login();`
   * 2. Export cookies: `const cookies = await auth.getPage().context().cookies();`
   * 3. Import to HTTP client: `httpClient.importCookiesFromPlaywright(cookies);`
   * 4. Fetch data: `await httpClient.getAccounts();`
   * 
   * See: npm run example:banesco-hybrid
   */
  async login(): Promise<BanescoHttpLoginResult> {
    // If already authenticated via imported cookies, allow operations
    if (this.isAuthenticated && this.cookies.size > 0) {
      this.log('✅ Already authenticated via imported cookies');
      return {
        success: true,
        message: 'Already authenticated via imported cookies',
        authenticated: true,
        cookies: new Map(this.cookies)
      };
    }
    
    // Fail fast with clear guidance
    const errorMessage = 
      'HTTP-only login is NOT supported for Banesco. ' +
      'The site requires JavaScript execution to establish session cookies. ' +
      'Use the hybrid approach: login with Playwright (BanescoAuth), then import cookies ' +
      'to this HTTP client for fast data fetching. See: npm run example:banesco-hybrid';
    
    this.log(`❌ ${errorMessage}`);
    
    return {
      success: false,
      message: errorMessage,
      authenticated: false,
      error: 'HTTP_LOGIN_NOT_SUPPORTED'
    };
  }

  /**
   * Get transactions (must be logged in first)
   * 
   * This method attempts to navigate to the transactions view via WebForms postback:
   * 1. GET the dashboard page
   * 2. Look for transaction tables directly on the dashboard
   * 3. If no tables found, discover postback actions for navigation
   * 4. Execute the best-match postback (e.g., "Movimientos", "Consulta")
   * 5. Parse the resulting transactions table
   */
  async getTransactions(): Promise<BanescoHttpScrapingResult> {
    if (!this.isAuthenticated) {
      return {
        success: false,
        message: 'Not authenticated. Call login() first or import cookies from Playwright.',
        transactions: [],
        error: 'Not authenticated'
      };
    }

    try {
      this.log('📊 Fetching transactions...');
      
      // Step 1: Navigate to dashboard
      this.log('📍 Step 1: Loading dashboard...');
      const dashboardHtml = await this.fetchPage(BANESCO_URLS.DASHBOARD);
      this.log(`   ✅ Got dashboard (${dashboardHtml.length} chars)`);
      
      // Step 2: Check if transactions are already visible on dashboard
      let { rows, tableFound } = parseTransactionsTable(dashboardHtml);
      
      if (tableFound && rows.length > 0) {
        this.log(`   ✅ Found transactions table directly on dashboard`);
        const transactions = this.parseTransactionRows(rows);
        this.log(`✅ Found ${transactions.length} transactions`);
        
        return {
          success: true,
          message: `Found ${transactions.length} transactions on dashboard`,
          transactions
        };
      }
      
      // Step 3: No transactions on dashboard - try to navigate via postback
      this.log('📍 Step 2: Discovering transaction navigation postbacks...');
      const bestPostBack = findBestTransactionPostBack(dashboardHtml);
      
      if (!bestPostBack) {
        this.log('   ⚠️  No transaction-related postback actions found');
        return {
          success: true,
          message: 'No transaction navigation found on dashboard. The dashboard may already show account summary.',
          transactions: []
        };
      }
      
      this.log(`   ✅ Found postback: "${bestPostBack.text}" → ${bestPostBack.target} (score: ${bestPostBack.score})`);
      
      // Step 4: Execute the postback to navigate to transactions
      this.log('📍 Step 3: Executing postback navigation...');
      const transactionsHtml = await this.executePostBack(dashboardHtml, bestPostBack);
      
      if (!transactionsHtml) {
        return {
          success: false,
          message: 'Failed to navigate to transactions page via postback',
          transactions: [],
          error: 'Postback navigation failed'
        };
      }
      
      this.log(`   ✅ Got transactions page (${transactionsHtml.length} chars)`);
      
      // Step 5: Parse the transactions table from the result
      const result = parseTransactionsTable(transactionsHtml);
      rows = result.rows;
      tableFound = result.tableFound;
      
      if (!tableFound) {
        // Maybe need a second navigation (account selection, etc.)
        this.log('   ⚠️  No transaction table found after postback');
        
        // Try one more level of postback discovery
        const secondPostBack = findBestTransactionPostBack(transactionsHtml);
        if (secondPostBack && secondPostBack.target !== bestPostBack.target) {
          this.log(`   🔄 Trying second postback: "${secondPostBack.text}" → ${secondPostBack.target}`);
          const secondHtml = await this.executePostBack(transactionsHtml, secondPostBack);
          
          if (secondHtml) {
            const secondResult = parseTransactionsTable(secondHtml);
            if (secondResult.tableFound) {
              const transactions = this.parseTransactionRows(secondResult.rows);
              this.log(`✅ Found ${transactions.length} transactions after second navigation`);
              
              return {
                success: true,
                message: `Found ${transactions.length} transactions (after 2 navigations)`,
                transactions
              };
            }
          }
        }
        
        return {
          success: true,
          message: 'Navigated to transactions area but no transaction table found. May need account selection.',
          transactions: []
        };
      }
      
      const transactions = this.parseTransactionRows(rows);
      this.log(`✅ Found ${transactions.length} transactions`);
      
      return {
        success: true,
        message: `Found ${transactions.length} transactions`,
        transactions
      };

    } catch (error: any) {
      this.log(`❌ Error fetching transactions: ${error.message}`);
      return {
        success: false,
        message: error.message,
        transactions: [],
        error: error.message
      };
    }
  }

  /**
   * Execute a WebForms postback to navigate within the authenticated session
   */
  private async executePostBack(currentPageHtml: string, action: PostBackAction): Promise<string | null> {
    try {
      // Parse the current page's hidden fields
      const formFields = parseAspNetFormFields(currentPageHtml);
      const allHiddenFields = parseAllHiddenFields(currentPageHtml);
      
      // Build the postback form data
      const formData = buildPostBackFormData(formFields, allHiddenFields, action);
      
      // POST to the dashboard URL (WebForms posts back to the same page)
      const response = await this.postForm(BANESCO_URLS.DASHBOARD, formData);
      
      // Handle redirects if needed
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, BANESCO_URLS.BASE).toString();
          this.log(`   ↪️ Following redirect to: ${redirectUrl.split('/').pop()}`);
          return await this.fetchPage(redirectUrl);
        }
      }
      
      return await response.text();
      
    } catch (error: any) {
      this.log(`   ❌ Postback execution failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if currently authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get current cookies (for debugging)
   */
  getCookies(): Map<string, string> {
    return new Map(this.cookies);
  }

  /**
   * Import cookies from a Playwright context
   * Use this after authenticating with Playwright to enable HTTP-based scraping
   * 
   * Accepts the full Playwright cookie shape from page.context().cookies()
   * which includes { name, value, domain, path, expires, httpOnly, secure, sameSite }
   * but only requires name and value.
   */
  importCookiesFromPlaywright(playwrightCookies: ReadonlyArray<{ name: string; value: string }>): void {
    if (!playwrightCookies || !Array.isArray(playwrightCookies)) {
      this.log('⚠️  No cookies provided to import');
      return;
    }
    
    let importedCount = 0;
    for (const cookie of playwrightCookies) {
      if (cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string') {
        this.cookies.set(cookie.name, cookie.value);
        importedCount++;
        this.log(`   [Cookie] Imported: ${cookie.name}`);
      }
    }
    
    this.isAuthenticated = importedCount > 0;
    this.log(`✅ Imported ${importedCount} cookies from Playwright (${playwrightCookies.length} provided)`);
  }

  /**
   * Set authenticated state (use after importing cookies from external source)
   */
  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
  }

  // ==========================================================================
  // Account & Movements API
  // ==========================================================================

  /**
   * Get list of accounts from the dashboard
   */
  async getAccounts(): Promise<BanescoAccountsResult> {
    if (!this.isAuthenticated) {
      return {
        success: false,
        message: 'Not authenticated. Call login() first or import cookies from Playwright.',
        accounts: [],
        error: 'Not authenticated'
      };
    }

    try {
      this.log('📋 Fetching accounts from dashboard...');
      
      const dashboardHtml = await this.fetchPage(BANESCO_URLS.DASHBOARD);
      
      // Debug: save HTML if in debug mode
      if (this.config.debug) {
        const fs = await import('fs');
        fs.writeFileSync('debug-banesco-dashboard.html', dashboardHtml);
        this.log(`   📄 Saved dashboard HTML to debug-banesco-dashboard.html (${dashboardHtml.length} chars)`);
        
        // Check if we got redirected to login
        if (dashboardHtml.includes('Login.aspx') || dashboardHtml.includes('txtUsuario')) {
          this.log(`   ⚠️ Dashboard appears to be login page - session may be invalid`);
        }
      }
      
      const parsedAccounts = parseAccountsFromDashboard(dashboardHtml);
      
      const accounts: BanescoHttpAccount[] = parsedAccounts.map(acc => ({
        type: acc.type,
        accountNumber: acc.accountNumber,
        balance: acc.balance,
        currency: acc.currency,
        postbackTarget: acc.postbackTarget,
        postbackArg: acc.postbackArg
      }));
      
      this.log(`✅ Found ${accounts.length} accounts`);
      
      return {
        success: true,
        message: `Found ${accounts.length} accounts`,
        accounts
      };

    } catch (error: any) {
      this.log(`❌ Error fetching accounts: ${error.message}`);
      return {
        success: false,
        message: error.message,
        accounts: [],
        error: error.message
      };
    }
  }

  /**
   * Get movement history for a specific account
   * Uses dashboard postback to navigate to movements, then submits the date form
   */
  async getAccountMovements(accountNumber: string): Promise<BanescoMovementsResult> {
    if (!this.isAuthenticated) {
      return {
        success: false,
        message: 'Not authenticated.',
        accountNumber,
        transactions: [],
        error: 'Not authenticated'
      };
    }

    try {
      this.log(`📊 Fetching movements for ${accountNumber}...`);
      
      // Step 1: Click account on dashboard to go to movements page
      this.log(`   Step 1: Navigating to movements page via dashboard...`);
      const dashboardHtml = await this.fetchPage(BANESCO_URLS.DASHBOARD);
      const accounts = parseAccountsFromDashboard(dashboardHtml);
      
      const targetAccount = accounts.find(acc => 
        acc.accountNumber === accountNumber || 
        acc.accountNumber.includes(accountNumber) ||
        accountNumber.includes(acc.accountNumber)
      );
      
      if (!targetAccount?.postbackTarget) {
        return {
          success: false,
          message: 'Account not found on dashboard or no postback available',
          accountNumber,
          transactions: [],
          error: 'Account not found'
        };
      }
      
      const movementsPageHtml = await this.executePostBack(dashboardHtml, {
        target: targetAccount.postbackTarget,
        argument: targetAccount.postbackArg || '',
        text: targetAccount.type,
        score: 100
      });
      
      if (!movementsPageHtml) {
        return {
          success: false,
          message: 'Failed to navigate to movements page',
          accountNumber,
          transactions: [],
          error: 'Navigation failed'
        };
      }
      
      this.log(`   Got movements form page (${movementsPageHtml.length} chars)`);
      
      // Save for debugging (only in debug mode)
      if (this.config.debug) {
        const fs = await import('fs');
        fs.writeFileSync('debug-banesco-movements.html', movementsPageHtml);
      }
      
      // Step 2: Submit the date filter form to get actual transactions
      if (!movementsPageHtml.includes('btnMostrar')) {
        this.log(`   ⚠️ No date filter form found`);
        return {
          success: true,
          message: 'Movements page has no date filter form',
          accountNumber,
          transactions: []
        };
      }
      
      this.log(`   Step 2: Submitting date filter form...`);
      const transactionsHtml = await this.submitMovementsDateForm(movementsPageHtml);
      
      if (!transactionsHtml) {
        return {
          success: false,
          message: 'Failed to submit date filter form',
          accountNumber,
          transactions: [],
          error: 'Form submission failed'
        };
      }
      
      this.log(`   Got transactions page (${transactionsHtml.length} chars)`);
      if (this.config.debug) {
        const fs = await import('fs');
        fs.writeFileSync('debug-banesco-transactions.html', transactionsHtml);
      }
      
      // Step 3: Parse transactions from result
      this.log(`   Step 3: Parsing transactions...`);
      const transactions = this.parseMovementsFromHtml(transactionsHtml, accountNumber);
      
      if (transactions.length > 0) {
        this.log(`✅ Found ${transactions.length} transactions`);
        return {
          success: true,
          message: `Found ${transactions.length} movements`,
          accountNumber,
          transactions
        };
      }
      
      // Check for "no movements" message
      const pageText = transactionsHtml.toLowerCase();
      if (pageText.includes('no posee movimientos') || pageText.includes('no hay movimientos')) {
        this.log(`   ℹ️ No movements in selected period`);
        return {
          success: true,
          message: 'No movements found in the selected period',
          accountNumber,
          transactions: []
        };
      }
      
      this.log(`   ⚠️ No transactions parsed from result`);
      return {
        success: true,
        message: 'Transactions page loaded but no data found',
        accountNumber,
        transactions: []
      };

    } catch (error: any) {
      this.log(`❌ Error: ${error.message}`);
      return {
        success: false,
        message: error.message,
        accountNumber,
        transactions: [],
        error: error.message
      };
    }
  }

  /**
   * Submit the date filter form on movements page to fetch actual transactions
   */
  private async submitMovementsDateForm(html: string): Promise<string | null> {
    try {
      const formFields = parseAspNetFormFields(html);
      const allHiddenFields = parseAllHiddenFields(html);
      
      // Build form data with all hidden fields and ASP.NET form fields
      // formFields contains __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION
      // allHiddenFields contains all hidden inputs (including those above)
      const formData: Record<string, string> = { 
        ...allHiddenFields,
        ...formFields  // Spread formFields to ensure ASP.NET state is included
      };
      
      // Set to use period selection with current month
      formData['ctl00$cp$TipoConsulta'] = 'rdbPeriodo';
      formData['ctl00$cp$ddlPeriodo'] = 'PeriodoMes';
      
      // Set date range (current month)
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const formatDate = (d: Date) => 
        `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      
      formData['ctl00$cp$dtFechaDesde'] = formatDate(firstOfMonth);
      formData['ctl00$cp$dtFechaHasta'] = formatDate(today);
      
      // Click the "Consultar" button
      formData['ctl00$cp$btnMostrar'] = 'Consultar';
      
      this.log(`   📤 Posting form with dates: ${formData['ctl00$cp$dtFechaDesde']} - ${formData['ctl00$cp$dtFechaHasta']}`);
      
      // Post to the form action URL (same page)
      const response = await this.postForm(BANESCO_URLS.MOVIMIENTOS_CUENTA, formData);
      
      // Handle redirect if needed
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const absoluteUrl = new URL(location, BANESCO_URLS.BASE).href;
          this.log(`   ↪️ Following redirect to: ${absoluteUrl.split('/').pop()}`);
          return await this.fetchPage(absoluteUrl);
        }
      }
      
      return await response.text();
      
    } catch (error: any) {
      this.log(`   ❌ Form submit failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Find postback action to select a specific account
   */
  private findAccountPostback(html: string, accountNumber: string): PostBackAction | null {
    const $ = cheerio.load(html);
    
    let result: PostBackAction | null = null;
    
    $('a').each((_: number, link: any) => {
      const $link = $(link);
      const text = $link.text().trim();
      const href = $link.attr('href') || '';
      const onclick = $link.attr('onclick') || '';
      
      // Check if this link relates to our account
      if (text.includes(accountNumber) || accountNumber.includes(text.replace(/\D/g, '').substring(0, 15))) {
        const postbackMatch = (href + ' ' + onclick).match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]?\s*\)/);
        if (postbackMatch) {
          result = {
            target: postbackMatch[1],
            argument: postbackMatch[2],
            text: text.substring(0, 50),
            score: 100
          };
          return false; // break
        }
      }
    });
    
    return result;
  }

  /**
   * Find postback for "Últimos Movimientos" or similar
   */
  private findMovimientosPostback(html: string): PostBackAction | null {
    const $ = cheerio.load(html);
    
    const keywords = ['movimientos', 'estado de cuenta', 'transacciones', 'historial', 'detalle'];
    let result: PostBackAction | null = null;
    let bestScore = 0;
    
    $('a').each((_: number, link: any) => {
      const $link = $(link);
      const text = $link.text().toLowerCase().trim();
      const href = $link.attr('href') || '';
      const onclick = $link.attr('onclick') || '';
      
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          score += 10;
        }
      }
      
      if (score > bestScore) {
        const postbackMatch = (href + ' ' + onclick).match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]?\s*\)/);
        if (postbackMatch) {
          bestScore = score;
          result = {
            target: postbackMatch[1],
            argument: postbackMatch[2],
            text: text.substring(0, 50),
            score
          };
        }
      }
    });
    
    return result;
  }

  /**
   * Parse movements/transactions from HTML page
   * Uses flexible parsing approach similar to the Playwright scraper
   */
  private parseMovementsFromHtml(html: string, _accountNumber: string): BanescoHttpTransaction[] {
    const $ = cheerio.load(html);
    const transactions: BanescoHttpTransaction[] = [];
    
    // First check for "no movements" messages
    const pageText = $('body').text().toLowerCase();
    const noMovementsPatterns = [
      'no posee movimientos',
      'no hay movimientos',
      'no existen movimientos',
      'sin movimientos',
      'no se encontraron movimientos',
      'no hay registros',
      'sin registros para mostrar'
    ];
    
    if (noMovementsPatterns.some(pattern => pageText.includes(pattern))) {
      this.log('   ℹ️ No movements message found on page');
      return [];
    }
    
    // Look for ALL tables and analyze each one
    $('table').each((_: number, table: any) => {
      const $table = $(table);
      const rows = $table.find('tr');
      
      if (rows.length < 2) return; // Skip tables with only header or no data
      
      // Check if headers contain transaction-related keywords
      const headerRow = rows.first();
      const headerText = headerRow.text().toLowerCase();
      const containsTransactionHeaders = /fecha|date|monto|amount|descripci[oó]n|description|saldo|balance|d[eé]bito|cr[eé]dito|referencia/i.test(headerText);
      
      if (!containsTransactionHeaders) return;
      
      this.log(`   📊 Found table with transaction headers: ${headerText.substring(0, 50)}...`);
      
      // Parse data rows (skip header)
      rows.slice(1).each((_: number, row: any) => {
        const $row = $(row);
        const cells: string[] = [];
        
        $row.find('td').each((_: number, cell: any) => {
          cells.push($(cell).text().trim());
        });
        
        if (cells.length < 3) return;
        
        // Use flexible parsing (similar to Playwright scraper)
        const tx = this.parseTransactionRowFlexible(cells);
        if (tx) {
          transactions.push(tx);
        }
      });
    });
    
    return transactions;
  }

  /**
   * Flexible row parsing - finds date, amount, description in any cell position
   */
  private parseTransactionRowFlexible(cells: string[]): BanescoHttpTransaction | null {
    // Find date (DD/MM/YYYY format)
    let date: string | null = null;
    for (const cell of cells) {
      const dateMatch = cell.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        break;
      }
    }
    
    // Find amount (number with comma/period)
    let amount = 0;
    let amountCell = '';
    for (const cell of cells) {
      // Look for numeric cells with decimal separators
      const cleanCell = cell.replace(/\s/g, '');
      if (/^[\d\.,\-]+$/.test(cleanCell) && (cleanCell.includes(',') || cleanCell.includes('.'))) {
        amountCell = cell;
        // Parse Spanish format (1.234,56)
        const normalized = cleanCell.replace(/\./g, '').replace(/,/g, '.');
        amount = Math.abs(parseFloat(normalized)) || 0;
        if (amount > 0) break;
      }
    }
    
    // Find D/C indicator (single letter D or C)
    let transactionType: 'debit' | 'credit' = 'credit';
    for (const cell of cells) {
      const trimmed = cell.trim().toUpperCase();
      if (trimmed === 'D') {
        transactionType = 'debit';
        break;
      } else if (trimmed === 'C') {
        transactionType = 'credit';
        break;
      }
    }
    
    // Also check if amount was negative
    if (amountCell.includes('-')) {
      transactionType = 'debit';
    }
    
    // Find description (longest text that's not date/amount)
    let description = '';
    for (const cell of cells) {
      const trimmed = cell.trim();
      // Skip if it looks like date, amount, or D/C
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed)) continue;
      if (/^[\d\.,\-]+$/.test(trimmed.replace(/\s/g, ''))) continue;
      if (/^[DC]$/i.test(trimmed)) continue;
      
      if (trimmed.length > description.length && trimmed.length > 3) {
        description = trimmed;
      }
    }
    
    // Require at least date and amount
    if (!date || amount === 0) {
      return null;
    }
    
    return {
      date,
      description: description || 'Transacción',
      amount,
      type: transactionType,
      balance: undefined,
      reference: undefined
    };
  }

  /**
   * Parse a single transaction row from table cells
   */
  private parseTransactionRow(cells: string[]): BanescoHttpTransaction | null {
    let date = '';
    let description = '';
    let debit = 0;
    let credit = 0;
    let balance = 0;
    let reference = '';
    
    for (const cell of cells) {
      // Skip empty cells
      if (!cell || cell.length === 0) continue;
      
      // Date pattern (DD/MM/YYYY)
      const dateMatch = cell.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        continue;
      }
      
      // Reference number (usually 6+ digits)
      if (/^\d{6,}$/.test(cell.replace(/\s/g, ''))) {
        reference = cell.trim();
        continue;
      }
      
      // Amount (numbers with comma/dot separators)
      const amountClean = cell.replace(/[^\d,.\-]/g, '');
      if (/^[\d,.\-]+$/.test(amountClean) && amountClean.length > 0) {
        const normalized = amountClean.replace(/\./g, '').replace(/,/g, '.');
        const amount = parseFloat(normalized);
        
        if (!isNaN(amount)) {
          // Determine if debit or credit based on position or sign
          if (amount < 0) {
            debit = Math.abs(amount);
          } else if (debit === 0 && credit === 0) {
            // First amount - could be either, assume credit unless description indicates otherwise
            credit = amount;
          } else if (balance === 0 && amount > Math.max(debit, credit) * 10) {
            // Likely the balance (usually much larger)
            balance = amount;
          } else if (debit === 0) {
            debit = amount;
          }
          continue;
        }
      }
      
      // Description (longest text that's not a number or date)
      if (cell.length > description.length && cell.length > 5 && !/^\d+$/.test(cell)) {
        description = cell;
      }
    }
    
    // Strict validation: require a valid date for a proper transaction
    // This prevents parsing labels and summary fields as transactions
    if (!date) {
      return null;
    }
    
    // Must have at least one non-zero amount
    if (debit === 0 && credit === 0) {
      return null;
    }
    
    return {
      date,
      description: description || 'Transacción',
      amount: debit > 0 ? debit : credit,
      type: debit > 0 ? 'debit' : 'credit',
      balance: balance > 0 ? balance : undefined,
      reference: reference || undefined
    };
  }

  /**
   * Convert raw parsed movements to typed transactions
   */
  private convertRawMovements(rawMovements: Array<{
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>): BanescoHttpTransaction[] {
    return rawMovements.map(mov => ({
      date: this.parseDate(mov.date),
      description: mov.description,
      amount: mov.debit > 0 ? mov.debit : mov.credit,
      type: mov.debit > 0 ? 'debit' as const : 'credit' as const,
      balance: mov.balance,
      reference: mov.reference
    }));
  }

  // ==========================================================================
  // Internal: Debug Helpers
  // ==========================================================================

  private debugStepCounter = 0;
  private debugSessionId = '';

  private async saveDebugHtml(step: string, html: string, url?: string): Promise<void> {
    if (!this.config.debug) return;
    
    try {
      const fs = await import('fs');
      
      // Initialize debug session ID on first call
      if (!this.debugSessionId) {
        this.debugSessionId = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      }
      
      this.debugStepCounter++;
      const safeName = step.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filename = `debug-banesco-${this.debugSessionId}-${this.debugStepCounter.toString().padStart(2, '0')}-${safeName}.html`;
      
      // Add metadata header to the HTML
      const metadata = `<!-- 
  Debug Capture
  Step: ${step}
  URL: ${url || 'N/A'}
  Timestamp: ${new Date().toISOString()}
  Cookies: ${this.cookies.size}
-->
`;
      
      fs.writeFileSync(filename, metadata + html);
      this.log(`   📄 Debug HTML saved: ${filename} (${html.length} chars)`);
    } catch (e) {
      this.log(`   ⚠️  Failed to save debug HTML: ${e}`);
    }
  }

  // ==========================================================================
  // Internal: Login Flow Steps
  // ==========================================================================

  private async loadLoginPage(): Promise<{
    formFields: AspNetFormFields;
    allHiddenFields: Record<string, string>;
  }> {
    // Step 1: Hit the main login page to get session cookie
    const mainPageHtml = await this.fetchPage(BANESCO_URLS.LOGIN_PAGE);
    this.log(`   ✅ Got main login page (${mainPageHtml.length} chars)`);
    await this.saveDebugHtml('main-login-page', mainPageHtml, BANESCO_URLS.LOGIN_PAGE);
    
    // Step 2: Load the iframe content (inicio.aspx -> redirects to LoginDNA.aspx)
    // Use Referer from the main page to simulate browser iframe load
    const inicioResponse = await this.makeRequest(BANESCO_URLS.LOGIN_IFRAME_INICIO, { 
      redirect: 'follow',
      headers: {
        'Referer': BANESCO_URLS.LOGIN_PAGE,
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      }
    });
    let iframeHtml = await inicioResponse.text();
    this.log(`   ✅ Got iframe content (${iframeHtml.length} chars)`);
    await this.saveDebugHtml('iframe-inicio', iframeHtml, BANESCO_URLS.LOGIN_IFRAME_INICIO);
    
    // Check for the actual form content (various field name patterns)
    const hasUsernameField = iframeHtml.includes('txtloginname') || 
                             iframeHtml.includes('txtUsuario') ||
                             iframeHtml.includes('ddpControles');
    
    if (!hasUsernameField) {
      // Try direct LoginDNA URL if inicio didn't work
      this.log(`   ⚠️  Form not found in inicio response, trying direct URL...`);
      
      const directResponse = await this.makeRequest(BANESCO_URLS.LOGIN_IFRAME_FORM, {
        redirect: 'follow',
        headers: {
          'Referer': BANESCO_URLS.LOGIN_PAGE,
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate', 
          'Sec-Fetch-Site': 'same-origin'
        }
      });
      iframeHtml = await directResponse.text();
      this.log(`   ✅ Got direct LoginDNA content (${iframeHtml.length} chars)`);
      await this.saveDebugHtml('iframe-login-dna', iframeHtml, BANESCO_URLS.LOGIN_IFRAME_FORM);
    }
    
    // Final check for form content
    const hasForm = iframeHtml.includes('txtloginname') || 
                    iframeHtml.includes('txtUsuario') ||
                    iframeHtml.includes('ddpControles');
    
    if (!hasForm) {
      await this.saveDebugHtml('login-form-not-found', iframeHtml, BANESCO_URLS.LOGIN_IFRAME_FORM);
      this.log(`   ⚠️  HTML preview: ${iframeHtml.substring(0, 500)}...`);
      
      throw new Error('Login form not found. The Banesco site may require JavaScript or a browser context.');
    }
    
    this.log(`   ✅ Found login form in HTML`);
    
    const parsed = parseLoginPage(iframeHtml);
    
    // Try to find VIEWSTATE with regex if cheerio missed it
    if (parsed.formFields.__VIEWSTATE.length < 500) {
      const viewStateMatch = iframeHtml.match(/name="__VIEWSTATE"[^>]*value="([^"]+)"/);
      if (viewStateMatch && viewStateMatch[1].length > parsed.formFields.__VIEWSTATE.length) {
        parsed.formFields.__VIEWSTATE = viewStateMatch[1];
        this.log(`   ✅ Found longer VIEWSTATE via regex (${parsed.formFields.__VIEWSTATE.length} chars)`);
      }
    }
    
    this.log(`   ✅ Got VIEWSTATE (${parsed.formFields.__VIEWSTATE.length} chars)`);
    this.log(`   ✅ Hidden fields: ${Object.keys(parsed.allHiddenFields).length}`);
    
    // Log hidden field names for debugging
    if (this.config.debug) {
      const fieldNames = Object.keys(parsed.allHiddenFields).slice(0, 10);
      this.log(`   📋 Sample hidden fields: ${fieldNames.join(', ')}...`);
    }
    
    return {
      formFields: parsed.formFields,
      allHiddenFields: parsed.allHiddenFields
    };
  }

  private async submitUsername(
    formFields: AspNetFormFields,
    allHiddenFields: Record<string, string>
  ): Promise<{ nextUrl: string }> {
    const formData: Record<string, string> = {
      ...formFields,
      huella: buildHuella(),
      txtBatUsuario: '',
      modal: '',
      urlRed: '',
      ValidarVacio: '^$',
      Hidden1: '',
      ClaveFormato: allHiddenFields['ClaveFormato'] || '^[a-zA-ZñÑ0-9!#\\$\\%\\?¡¿\\*_\\.-]{8,15}$',
      UsuarioFormato: allHiddenFields['UsuarioFormato'] || '^[a-zA-Z0-9_.]{4,10}$',
      RangoUsuario: allHiddenFields['RangoUsuario'] || '6|10',
      RangoClave: allHiddenFields['RangoClave'] || '8|15',
      ErrorUsuario: 'Por favor indique su Usuario.',
      ErrorUsuarioInvalido: 'Usuario inválido. Por favor verifique e intente de nuevo.',
      ErrorClaveAcceso: 'Por favor ingrese la clave que posee para acceder a los servicios de Internet de BanescOnline',
      ErrorClaveAccesoInvalida: 'La Clave introducida no es válida.',
      ErrorDobleClick: 'Su operación está en proceso. Por favor, espere el resultado sin presionar nuevamente el botón Aceptar',
      lblURL: BANESCO_URLS.LOGIN_PAGE,
      lnkSitioSeguro2: "window.open('../Ayudas/sitio_seguro_banesconline.htm','ayuda','width=320,height=220,scrollbars=yes')",
      lnkSitioSeguro: "window.open('../Ayudas/sitio_seguro_banesconline.htm','ayuda','width=320,height=220,scrollbars=yes')",
      lnkCandado: "javascript:selloIrA('mantis');",
      // Try both field name patterns (ASP.NET uses different naming conventions)
      txtUsuario: this.credentials.username,
      'ctl00$cp$ddpControles$txtloginname': this.credentials.username,
      bAceptar: 'Aceptar',
      'ctl00$cp$ddpControles$btnAcceder': 'Aceptar'
    };

    // Log form data being sent (sensitive fields redacted)
    if (this.config.debug) {
      const debugFormData = { ...formData };
      if (debugFormData['ctl00$cp$ddpControles$txtloginname']) {
        debugFormData['ctl00$cp$ddpControles$txtloginname'] = '***REDACTED***';
      }
      if (debugFormData['txtUsuario']) {
        debugFormData['txtUsuario'] = '***REDACTED***';
      }
      this.log(`   📤 POST fields: ${Object.keys(formData).length}`);
      this.log(`   📤 Key fields: __VIEWSTATE(${formData.__VIEWSTATE?.length || 0}), huella(${formData.huella?.length || 0})`);
    }

    const response = await this.postForm(BANESCO_URLS.LOGIN_IFRAME_FORM, formData);
    
    // Should redirect to AU_ValDNA.aspx (security questions)
    const location = response.headers.get('location');
    
    this.log(`   📥 Response: ${response.status} ${response.statusText}`);
    if (location) {
      this.log(`   📥 Location header: ${location}`);
    }
    
    if (response.status === 302 && location) {
      const nextUrl = new URL(location, BANESCO_URLS.BASE).toString();
      this.log(`   ✅ Username submitted, redirecting to: ${nextUrl.split('/').pop()}`);
      return { nextUrl };
    }
    
    // If not a redirect, check the response body for errors or next steps
    const html = await response.text();
    await this.saveDebugHtml('after-username-submit', html, BANESCO_URLS.LOGIN_IFRAME_FORM);
    
    // Check if we got an error page
    if (html.includes('error') || html.includes('Error')) {
      this.log(`   ⚠️  Response may contain an error`);
      
      // Try to extract error message
      const errorMatch = html.match(/class="[^"]*error[^"]*"[^>]*>([^<]+)</i);
      if (errorMatch) {
        this.log(`   ⚠️  Error message: ${errorMatch[1].trim()}`);
      }
    }
    
    // Check for "usuario incorrecto" or similar
    if (html.toLowerCase().includes('incorrecto') || html.toLowerCase().includes('invalid')) {
      throw new Error('Username rejected by server - check credentials');
    }
    
    // Try to find the form action for next step
    const formActionMatch = html.match(/action="([^"]+)"/);
    if (formActionMatch) {
      const nextUrl = new URL(formActionMatch[1], BANESCO_URLS.BASE).toString();
      this.log(`   ✅ Username submitted, next form at: ${nextUrl.split('/').pop()}`);
      return { nextUrl };
    }
    
    // Default to security questions URL
    this.log(`   ⚠️  No redirect found, defaulting to security questions`);
    return { nextUrl: BANESCO_URLS.SECURITY_QUESTIONS };
  }

  private async submitSecurityQuestions(pageUrl: string): Promise<{ nextUrl: string }> {
    // Load security questions page
    const html = await this.fetchPage(pageUrl);
    await this.saveDebugHtml('security-questions-page', html, pageUrl);
    
    const parsed = parseSecurityQuestionsPage(html);
    
    this.log(`   Found ${parsed.questions.length} security questions`);
    
    // Log the actual questions for debugging
    if (this.config.debug && parsed.questions.length > 0) {
      parsed.questions.forEach((q, i) => {
        this.log(`   Q${i + 1}: "${q.questionText.substring(0, 50)}..." → field: ${q.inputId}`);
      });
    }
    
    // Match and answer questions
    const answers: Record<string, string> = {};
    
    for (const question of parsed.questions) {
      const answer = this.findSecurityAnswer(question.questionText);
      if (answer) {
        // Map input IDs to form field names
        const fieldName = this.getSecurityFieldName(question.inputId);
        answers[fieldName] = answer;
        this.log(`   Matched: "${question.questionText.substring(0, 30)}..." → answer provided`);
      }
    }
    
    // Build form data
    const formData: Record<string, string> = {
      ...parsed.formFields,
      huella: buildHuella(),
      txtEjecutar: '',
      PreguntaRespuestaFormato: '^[a-zA-Z0-9 _\\-/¿?¡!,.ñÑáÁéÉÍíóÓúÚ]{1,100}$',
      ValidarVacio: '^$',
      ErrorRespuestas: 'Por favor responda las preguntas de seguridad.',
      ErrorPreguntasDistintas: 'La pregunta seleccionada debe ser diferente a las demás.',
      ErrorPreguntasRespuestasIgualdad: 'Las preguntas y respuestas de seguridad deben ser diferentes.',
      IdePregunta: parsed.allHiddenFields['IdePregunta'] || '',
      ErrorRespuestasIgualdad: 'Las respuestas de seguridad deben ser diferentes.',
      txtBatUsuario: '',
      MaxPreguntaRespuesta: '65',
      ErrorDobleClick: 'Su operación está en proceso. Por favor, espere el resultado sin presionar nuevamente el botón Aceptar',
      IdePregunta2: parsed.allHiddenFields['IdePregunta2'] || '',
      IdePregunta3: parsed.allHiddenFields['IdePregunta3'] || '',
      IdePregunta4: parsed.allHiddenFields['IdePregunta4'] || '',
      ContadorPreguntas: String(parsed.questionCount || parsed.questions.length),
      ...answers,
      bAceptar: 'Aceptar'
    };

    const response = await this.postForm(pageUrl, formData);
    
    // Should redirect to ContrasenaDNA.aspx (password page)
    const location = response.headers.get('location');
    
    this.log(`   📥 Response: ${response.status} ${response.statusText}`);
    
    // Check response body if no redirect
    if (response.status === 200) {
      const responseHtml = await response.text();
      await this.saveDebugHtml('after-security-questions', responseHtml, pageUrl);
      
      // Check for errors
      if (responseHtml.toLowerCase().includes('incorrecto') || 
          responseHtml.toLowerCase().includes('invalid') ||
          responseHtml.toLowerCase().includes('error')) {
        this.log(`   ⚠️  Security questions response may contain an error`);
      }
    }
    
    const nextUrl = location 
      ? new URL(location, BANESCO_URLS.BASE).toString()
      : BANESCO_URLS.PASSWORD;
    
    this.log(`   ✅ Security questions answered, redirecting to: ${nextUrl.split('/').pop()}`);
    
    return { nextUrl };
  }

  private async submitPassword(pageUrl: string): Promise<{ nextUrl: string }> {
    // Load password page
    const html = await this.fetchPage(pageUrl);
    await this.saveDebugHtml('password-page', html, pageUrl);
    
    const parsed = parsePasswordPage(html);
    
    // Build form data (similar structure to username page)
    const formData: Record<string, string> = {
      ...parsed.formFields,
      huella: buildHuella(),
      txtBatUsuario: '',
      ValidarVacio: '^$',
      Hidden1: '',
      ClaveFormato: parsed.allHiddenFields['ClaveFormato'] || '^[a-zA-ZñÑ0-9!#\\$\\%\\?¡¿\\*_\\.-]{8,15}$',
      UsuarioFormato: parsed.allHiddenFields['UsuarioFormato'] || '^[a-zA-Z0-9_.]{4,10}$',
      RangoUsuario: parsed.allHiddenFields['RangoUsuario'] || '6|10',
      RangoClave: parsed.allHiddenFields['RangoClave'] || '8|15',
      ErrorUsuario: 'Por favor indique su Usuario.',
      ErrorUsuarioInvalido: 'Usuario inválido. Por favor verifique e intente de nuevo.',
      ErrorClaveAcceso: 'Por favor ingrese la clave que posee para acceder a los servicios de Internet de BanescOnline',
      ErrorClaveAccesoInvalida: 'La Clave introducida no es válida.',
      ErrorDobleClick: 'Su operación está en proceso. Por favor, espere el resultado sin presionar nuevamente el botón Aceptar',
      lblURL: parsed.allHiddenFields['lblURL'] || BANESCO_URLS.LOGIN_IFRAME_FORM,
      lnkSitioSeguro2: "window.open('../Ayudas/sitio_seguro_banesconline.htm','ayuda','width=320,height=220,scrollbars=yes')",
      lnkSitioSeguro: "window.open('../Ayudas/sitio_seguro_banesconline.htm','ayuda','width=320,height=220,scrollbars=yes')",
      lnkCandado: "javascript:selloIrA('mantis');",
      txtClave: this.credentials.password,
      CBMachine: 'on',
      bAceptar: 'Aceptar'
    };

    // Log password submission (password redacted)
    if (this.config.debug) {
      this.log(`   📤 POST fields: ${Object.keys(formData).length}`);
    }

    const response = await this.postForm(pageUrl, formData);
    
    // After password, we get HTML with JS redirect or need to follow Location
    const location = response.headers.get('location');
    
    this.log(`   📥 Response: ${response.status} ${response.statusText}`);
    
    // The response might be HTML with a redirect, or a 302
    if (location) {
      const nextUrl = new URL(location, BANESCO_URLS.BASE).toString();
      this.log(`   ✅ Password submitted, redirecting to: ${nextUrl.split('/').pop()}`);
      return { nextUrl };
    }
    
    // Check response body for errors or JS redirects
    if (response.status === 200) {
      const responseHtml = await response.text();
      await this.saveDebugHtml('after-password-submit', responseHtml, pageUrl);
      
      // Check for errors
      if (responseHtml.toLowerCase().includes('clave incorrecta') || 
          responseHtml.toLowerCase().includes('contraseña inválida') ||
          responseHtml.toLowerCase().includes('invalid password')) {
        throw new Error('Password rejected by server - check credentials');
      }
      
      // Look for JavaScript redirect
      const jsRedirectMatch = responseHtml.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
      if (jsRedirectMatch) {
        const nextUrl = new URL(jsRedirectMatch[1], BANESCO_URLS.BASE).toString();
        this.log(`   ✅ Found JS redirect to: ${nextUrl.split('/').pop()}`);
        return { nextUrl };
      }
      
      // Look for meta refresh
      const metaRefreshMatch = responseHtml.match(/http-equiv="refresh"[^>]*content="[^"]*url=([^"]+)"/i);
      if (metaRefreshMatch) {
        const nextUrl = new URL(metaRefreshMatch[1], BANESCO_URLS.BASE).toString();
        this.log(`   ✅ Found meta refresh to: ${nextUrl.split('/').pop()}`);
        return { nextUrl };
      }
    }
    
    // If no redirect header, the page may contain a meta refresh or JS redirect
    // In practice, we should end up at Default.aspx after following redirects
    this.log(`   ✅ Password submitted, navigating to dashboard...`);
    return { nextUrl: BANESCO_URLS.DASHBOARD };
  }

  private async verifyAuthentication(dashboardUrl: string): Promise<{
    isAuthenticated: boolean;
    finalUrl: string;
  }> {
    // Fetch the dashboard page
    const html = await this.fetchPage(dashboardUrl);
    await this.saveDebugHtml('dashboard-verification', html, dashboardUrl);
    
    const parsed = parseDashboardPage(html);
    
    if (parsed.isAuthenticated) {
      this.log(`   ✅ Authentication verified (found ${parsed.menuLinks.length} menu links)`);
    } else {
      this.log(`   ❌ Authentication not verified`);
    }
    
    return {
      isAuthenticated: parsed.isAuthenticated,
      finalUrl: dashboardUrl
    };
  }

  // ==========================================================================
  // Internal: HTTP Helpers
  // ==========================================================================

  private async fetchPage(url: string): Promise<string> {
    const response = await this.makeRequest(url, {
      method: 'GET',
      redirect: 'follow'
    });
    
    return response.text();
  }

  private async postForm(url: string, formData: Record<string, string>): Promise<Response> {
    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(formData).toString(),
      redirect: 'manual' // Handle redirects manually to capture cookies
    });
    
    // If redirected, follow but first capture any new cookies
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        // Cookies are already captured in makeRequest
        // Return the response so caller can handle redirect
      }
    }
    
    return response;
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: HeadersInit = {
      'User-Agent': this.config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-US,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': options.method === 'POST' ? 'iframe' : 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      ...(options.headers || {})
    };
    
    // Add cookies
    if (this.cookies.size > 0) {
      (headers as Record<string, string>)['Cookie'] = serializeCookies(this.cookies);
      this.log(`   [Cookie] Sending: ${serializeCookies(this.cookies).substring(0, 50)}...`);
    }
    
    // Add referer for POST requests
    if (options.method === 'POST') {
      (headers as Record<string, string>)['Origin'] = BANESCO_URLS.BASE;
      (headers as Record<string, string>)['Referer'] = url;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      this.log(`   [${options.method || 'GET'}] ${url.substring(url.lastIndexOf('/') + 1)}`);
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Capture cookies from response - handle multiple Set-Cookie headers
      // Node.js fetch combines them with ", " but we need to parse carefully
      const setCookieRaw = response.headers.get('set-cookie');
      if (setCookieRaw) {
        // Split by ", " but be careful with expires dates that also contain ", "
        // Each cookie typically starts with a name= pattern
        const cookieParts = setCookieRaw.split(/,(?=[A-Za-z_][A-Za-z0-9_]*=)/);
        for (const part of cookieParts) {
          const newCookies = parseCookies(part.trim());
          newCookies.forEach((value, name) => {
            this.cookies.set(name, value);
            this.log(`   [Cookie] Set: ${name}=${value.substring(0, 20)}...`);
          });
        }
      }
      
      this.log(`   [Response] ${response.status} ${response.statusText}`);
      
      return response;
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }

  // ==========================================================================
  // Internal: Security Questions
  // ==========================================================================

  private parseSecurityQuestions(config: string): Map<string, string> {
    const map = new Map<string, string>();
    
    if (!config) return map;
    
    const pairs = config.split(',');
    for (const pair of pairs) {
      const [keyword, answer] = pair.split(':');
      if (keyword && answer) {
        const normalizedKeyword = keyword.trim().toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''); // Remove accents
        map.set(normalizedKeyword, answer.trim());
      }
    }
    
    return map;
  }

  private findSecurityAnswer(questionText: string): string | null {
    const normalizedQuestion = questionText.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!]/g, '');

    for (const [keyword, answer] of this.securityQuestionsMap.entries()) {
      if (normalizedQuestion.includes(keyword)) {
        return answer;
      }
    }
    
    return null;
  }

  private getSecurityFieldName(inputId: string): string {
    // Map simple IDs to ASP.NET form field names
    const mapping: Record<string, string> = {
      'txtPrimeraR': 'txtPrimeraR',
      'txtSegundaR': 'txtSegundaR',
      'txtTerceraR': 'txtTerceraR',
      'txtCuartaR': 'txtCuartaR'
    };
    
    return mapping[inputId] || inputId;
  }

  // ==========================================================================
  // Internal: Transaction Parsing
  // ==========================================================================

  private parseTransactionRows(rows: string[][]): BanescoHttpTransaction[] {
    const transactions: BanescoHttpTransaction[] = [];
    
    for (const row of rows) {
      if (row.length < 3) continue;
      
      try {
        const dateStr = this.findDateInRow(row);
        const amountStr = this.findAmountInRow(row);
        const description = this.findDescriptionInRow(row);
        const dcValue = this.findDCValue(row);
        
        if (!dateStr || !amountStr) continue;
        
        const amount = this.parseAmount(amountStr);
        const type = dcValue === 'D' ? 'debit' : 'credit';
        
        transactions.push({
          date: this.parseDate(dateStr),
          description: description || 'Transacción',
          amount: Math.abs(amount),
          type
        });
        
      } catch {
        continue;
      }
    }
    
    return transactions;
  }

  private findDateInRow(row: string[]): string | null {
    for (const cell of row) {
      if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(cell)) {
        return cell;
      }
    }
    return null;
  }

  private findAmountInRow(row: string[]): string | null {
    for (const cell of row) {
      if (/[\d\.,]+/.test(cell) && (cell.includes(',') || cell.includes('.'))) {
        return cell;
      }
    }
    return null;
  }

  private findDescriptionInRow(row: string[]): string | null {
    let longestCell = '';
    for (const cell of row) {
      if (cell.length > longestCell.length && 
          !this.findDateInRow([cell]) && 
          !this.findAmountInRow([cell])) {
        longestCell = cell;
      }
    }
    return longestCell || null;
  }

  private findDCValue(row: string[]): string {
    for (const cell of row) {
      if (/^[DC]$/i.test(cell.trim())) {
        return cell.trim().toUpperCase();
      }
    }
    return '';
  }

  private parseAmount(amountString: string): number {
    const cleanAmount = amountString
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    return parseFloat(cleanAmount) || 0;
  }

  private parseDate(dateString: string): string {
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
  }

  // ==========================================================================
  // Internal: Logging
  // ==========================================================================

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[BanescoHTTP] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Banesco HTTP client
 * 
 * Note: This client requires cookies from a Playwright session.
 * Use BanescoAuth for login, then import cookies to this client.
 */
export function createBanescoHttpClient(
  credentials: BanescoHttpCredentials,
  config?: BanescoHttpConfig
): BanescoHttpClient {
  return new BanescoHttpClient(credentials, config);
}
