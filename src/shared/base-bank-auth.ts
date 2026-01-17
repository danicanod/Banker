/**
 * Abstract Base Bank Authentication Class
 * 
 * This abstract class provides common functionality for all bank authentication
 * implementations, including browser management, logging, error handling, and
 * common configuration patterns.
 */

import { Browser, Page, Frame, chromium, BrowserContext } from 'playwright';
import type { BaseBankAuthConfig, BaseBankLoginResult, BaseBankCredentials } from './types/index.js';
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { 
  PerformanceConfig, 
  getBankPerformanceConfig, 
  getBlockedDomains, 
  isEssentialJS,
  PERFORMANCE_PRESETS
} from './performance-config.js';

/**
 * Aggregated blocked request statistics (to avoid per-request log spam)
 */
interface BlockedRequestStats {
  total: number;
  byCategory: {
    tracking: number;
    css: number;
    image: number;
    font: number;
    media: number;
    nonEssentialJs: number;
  };
}

export abstract class BaseBankAuth<
  TCredentials extends BaseBankCredentials,
  TConfig extends BaseBankAuthConfig,
  TLoginResult extends BaseBankLoginResult
> {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected context: BrowserContext | null = null;
  protected credentials: TCredentials;
  protected config: Required<TConfig>;
  protected isAuthenticated: boolean = false;
  protected logFile: string;
  protected bankName: string;
  protected performanceConfig: PerformanceConfig;
  
  /** Aggregated blocked request stats (summary logged once on close) */
  private blockedStats: BlockedRequestStats = this.createEmptyBlockedStats();
  private blockedStatsSummaryLogged: boolean = false;

  constructor(bankName: string, credentials: TCredentials, config: TConfig) {
    this.bankName = bankName;
    this.credentials = credentials;
    
    // Set up default configuration - subclasses can override specific defaults
    this.config = this.getDefaultConfig(config);
    
    // Get optimized performance configuration for this bank's auth flow
    this.performanceConfig = getBankPerformanceConfig(
      bankName, 
      'auth',
      (config as any).performancePreset
    );
    
    // Allow custom performance overrides
    if ((config as any).performance) {
      this.performanceConfig = { 
        ...this.performanceConfig,
        ...(config as any).performance 
      };
    }
    
    // Setup log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const userIdentifier = this.getUserIdentifier();
    this.logFile = `debug-${bankName.toLowerCase()}-${userIdentifier}-${timestamp}.log`;
    
    this.log(`🏦 ${bankName} Auth initialized for user: ${this.getUserIdentifier()}***`);
    this.log(`⚡ Performance config: CSS:${this.performanceConfig.blockCSS}, IMG:${this.performanceConfig.blockImages}, JS:${this.performanceConfig.blockNonEssentialJS}`);
    
    if (this.config.debug) {
      this.log('🐛 Debug mode enabled - Playwright debugger will pause at key points');
    }
  }

  /**
   * Get default configuration with bank-specific overrides
   * Subclasses should override this to provide bank-specific defaults
   */
  protected getDefaultConfig(config: TConfig): Required<TConfig> {
    return {
      headless: false,
      timeout: 30000,
      debug: false,
      saveSession: true,
      ...config
    } as Required<TConfig>;
  }

  /**
   * Get user identifier for logging (should be safe/truncated)
   * Subclasses must implement this to provide safe user identification
   */
  protected abstract getUserIdentifier(): string;

  /**
   * Get the login URL for the bank
   * Subclasses must implement this
   */
  protected abstract getLoginUrl(): string;

  /**
   * Perform the actual login logic specific to each bank
   * Subclasses must implement this with their specific authentication flow
   */
  protected abstract performBankSpecificLogin(): Promise<boolean>;

  /**
   * Verify if login was successful using bank-specific indicators
   * Subclasses must implement this
   */
  protected abstract verifyLoginSuccess(): Promise<boolean>;

  /**
   * Log message to console and file
   */
  protected log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    console.log(message);
    
    try {
      appendFileSync(this.logFile, logEntry + '\n');
    } catch (error) {
      // Fallback if file writing fails
      console.warn('Failed to write to log file:', error);
    }
  }

  /**
   * Create empty blocked request statistics object
   */
  private createEmptyBlockedStats(): BlockedRequestStats {
    return {
      total: 0,
      byCategory: {
        tracking: 0,
        css: 0,
        image: 0,
        font: 0,
        media: 0,
        nonEssentialJs: 0
      }
    };
  }

  /**
   * Reset blocked request statistics (called when initializing new browser)
   */
  private resetBlockedStats(): void {
    this.blockedStats = this.createEmptyBlockedStats();
    this.blockedStatsSummaryLogged = false;
  }

  /**
   * Log the blocked requests summary (called once on close)
   */
  private logBlockedStatsSummary(): void {
    if (this.blockedStatsSummaryLogged || this.blockedStats.total === 0) {
      return;
    }
    
    this.blockedStatsSummaryLogged = true;
    
    const { total, byCategory } = this.blockedStats;
    const parts: string[] = [];
    
    if (byCategory.tracking > 0) parts.push(`tracking=${byCategory.tracking}`);
    if (byCategory.css > 0) parts.push(`css=${byCategory.css}`);
    if (byCategory.image > 0) parts.push(`image=${byCategory.image}`);
    if (byCategory.font > 0) parts.push(`font=${byCategory.font}`);
    if (byCategory.media > 0) parts.push(`media=${byCategory.media}`);
    if (byCategory.nonEssentialJs > 0) parts.push(`js=${byCategory.nonEssentialJs}`);
    
    const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    this.log(`🧱 Blocked resources: ${total}${breakdown}`);
  }

  /**
   * Pause execution for debugging with Playwright debugger
   * Only pauses if debug mode is enabled
   */
  protected async debugPause(message: string): Promise<void> {
    if (this.config.debug && this.page) {
      this.log(`🐛 DEBUG PAUSE: ${message}`);
      this.log('💡 Use Playwright Inspector to debug. Continue execution when ready.');
      await this.page.pause();
    }
  }

  /**
   * Wait for element to be ready (visible and enabled) on page
   */
  protected async waitForElementReady(selector: string, timeout: number = 10000): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      // Wait for element to exist
      await this.page.waitForSelector(selector, { timeout });
      
      // Wait for element to be visible and enabled
      await this.page.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null && // visible
                 !element.hasAttribute('disabled'); // enabled
        },
        selector,
        { timeout }
      );
      
      return true;
    } catch (error) {
      this.log(`⚠️  Element not ready: ${selector} - ${error}`);
      return false;
    }
  }

  /**
   * Wait for element to be ready (visible and enabled) on frame
   */
  protected async waitForElementReadyOnFrame(frame: Frame, selector: string, timeout: number = 10000): Promise<boolean> {
    try {
      // Wait for element to exist
      await frame.waitForSelector(selector, { timeout });
      
      // Wait for element to be visible and enabled
      await frame.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null && // visible
                 !element.hasAttribute('disabled'); // enabled
        },
        selector,
        { timeout }
      );
      
      return true;
    } catch (error) {
      this.log(`⚠️  Element not ready on frame: ${selector} - ${error}`);
      return false;
    }
  }

  /**
   * Wait for navigation completion by checking for new content
   */
  protected async waitForNavigation(expectedSelectors: string[] = [], timeout: number = 15000): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      this.log('⏳ Waiting for navigation to complete...');
      
      // First try immediate check - maybe elements are already there
      for (const selector of expectedSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && await element.isVisible()) {
            this.log(`✅ Navigation detected: found ${selector} immediately`);
            return true;
          }
        } catch (e) {
          // Continue checking
        }
      }
      
      // If not immediate, wait for any of the expected selectors to appear
      if (expectedSelectors.length > 0) {
        this.log(`🔍 Waiting for any of: ${expectedSelectors.join(', ')}`);
        
        try {
          await Promise.race(
            expectedSelectors.map(selector => 
              this.page!.waitForSelector(selector, { timeout })
            )
          );
          this.log('✅ Navigation detected: new content appeared');
          return true;
        } catch (raceError) {
          this.log(`⚠️  None of expected elements appeared: ${raceError}`);
        }
      }
      
      // Fallback: wait for load state change
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        this.log('✅ Navigation completed: network idle');
        return true;
      } catch (loadError) {
        this.log(`⚠️  Load state timeout: ${loadError}`);
      }
      
      this.log('✅ Navigation assumed successful - continuing');
      return true;
      
    } catch (error) {
      this.log(`⚠️  Navigation timeout: ${error}`);
      return false;
    }
  }

  /**
   * Setup request interception for performance optimizations
   */
  protected async setupRequestInterception(page: Page): Promise<void> {
    this.log('⚡ Setting up performance optimizations...');
    
    const blockedDomains = getBlockedDomains(this.performanceConfig);
    
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();
      
      // Check if URL contains blocked domains
      const shouldBlockDomain = blockedDomains.some(domain => url.includes(domain));
      
      if (shouldBlockDomain) {
        this.blockedStats.total++;
        this.blockedStats.byCategory.tracking++;
        await route.abort();
        return;
      }
      
      // Block by resource type
      if (this.performanceConfig.blockCSS && resourceType === 'stylesheet') {
        this.blockedStats.total++;
        this.blockedStats.byCategory.css++;
        await route.abort();
        return;
      }
      
      if (this.performanceConfig.blockImages && resourceType === 'image') {
        this.blockedStats.total++;
        this.blockedStats.byCategory.image++;
        await route.abort();
        return;
      }
      
      if (this.performanceConfig.blockFonts && resourceType === 'font') {
        this.blockedStats.total++;
        this.blockedStats.byCategory.font++;
        await route.abort();
        return;
      }
      
      if (this.performanceConfig.blockMedia && (resourceType === 'media' || resourceType === 'websocket')) {
        this.blockedStats.total++;
        this.blockedStats.byCategory.media++;
        await route.abort();
        return;
      }
      
      // Block non-essential JavaScript using intelligent detection
      if (this.performanceConfig.blockNonEssentialJS && resourceType === 'script') {
        if (!isEssentialJS(url, this.bankName)) {
          this.blockedStats.total++;
          this.blockedStats.byCategory.nonEssentialJs++;
          await route.abort();
          return;
        }
      }
      
      // Allow the request
      await route.continue();
    });
    
    this.log(`✅ Performance optimizations active - ${blockedDomains.length} domains blocked`);
  }

  /**
   * Initialize Playwright browser and page with performance optimizations
   */
  protected async initializeBrowser(): Promise<void> {
    this.log('🌐 Initializing optimized browser...');
    
    // Reset blocked stats for new session
    this.resetBlockedStats();
    
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      // Performance optimizations
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection'
    ];
    
    // Add additional performance args if in headless mode
    if (this.config.headless) {
      launchArgs.push(
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--run-all-compositor-stages-before-draw',
        '--disable-blink-features=AutomationControlled'
      );
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: launchArgs
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Performance: disable images, CSS, fonts if configured
      // Note: This approach is less granular but very effective
      ...(this.performanceConfig.blockImages && this.performanceConfig.blockCSS ? {
        javaScriptEnabled: true, // Keep JS for functionality
        // Block resources at context level for maximum performance
      } : {})
    });

    this.page = await this.context.newPage();
    
    // Setup request interception for fine-grained control
    await this.setupRequestInterception(this.page);
    
    // Disable unnecessary features for performance
    await this.page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });
    
    // Set aggressive timeouts for faster failure
    this.page.setDefaultTimeout(this.config.timeout || 30000);
    this.page.setDefaultNavigationTimeout(this.config.timeout || 30000);
    
    if (this.config.debug) {
      this.log('🐛 Optimized browser initialized in debug mode');
      this.log(`📱 Viewport: 1366x768, Headless: ${this.config.headless}`);
      this.log(`⏱️  Timeout: ${this.config.timeout}ms`);
      this.log(`⚡ Performance optimizations: ${JSON.stringify(this.performanceConfig)}`);
      this.log(`📄 Log file: ${this.logFile}`);
    }
  }

  /**
   * Main login method template - implements common flow
   */
  async login(): Promise<TLoginResult> {
    this.log(`🚀 Starting ${this.bankName} authentication process...`);
    
    try {
      // Initialize browser if not already done
      if (!this.browser || !this.page) {
        await this.initializeBrowser();
      }
      
      if (!this.page) {
        throw new Error('Failed to initialize browser page');
      }

      await this.debugPause('Browser initialized - ready to navigate to login page');

      // Navigate to login page
      this.log(`🌐 Navigating to ${this.bankName} login page...`);
      await this.page.goto(this.getLoginUrl(), { 
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout 
      });

      await this.debugPause('Login page loaded - ready to start authentication');

      // Perform bank-specific login
      const loginSuccess = await this.performBankSpecificLogin();
      
      if (loginSuccess) {
        this.isAuthenticated = true;
        this.log(`🎉 ${this.bankName} authentication successful!`);
        
        await this.debugPause('Login completed successfully - authenticated page ready');
        
        return this.createSuccessResult();
      } else {
        return this.createFailureResult('Authentication failed');
      }

    } catch (error: any) {
      this.log(`💥 Authentication error: ${error.message || error}`);
      await this.debugPause(`Error occurred: ${error.message} - inspect page state`);
      return this.createFailureResult(error.message || 'Unknown error occurred');
    }
  }

  /**
   * Create success result - subclasses can override for additional data
   */
  protected createSuccessResult(): TLoginResult {
    return {
      success: true,
      message: 'Authentication successful',
      sessionValid: true,
    } as TLoginResult;
  }

  /**
   * Create failure result - subclasses can override for additional data
   */
  protected createFailureResult(message: string): TLoginResult {
    return {
      success: false,
      message,
      sessionValid: false,
      error: message
    } as TLoginResult;
  }

  /**
   * Get the authenticated page for further operations
   */
  getPage(): Page | null {
    return this.isAuthenticated ? this.page : null;
  }

  /**
   * Check if currently authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<string | null> {
    return this.page ? this.page.url() : null;
  }

  /**
   * Get credentials for logging purposes (should be implemented safely by subclasses)
   */
  abstract getCredentials(): Record<string, any>;

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

  /**
   * Export logs to a specific file
   */
  exportLogs(targetPath: string): boolean {
    try {
      const content = this.getLogContent();
      writeFileSync(targetPath, content);
      this.log(`📤 Logs exported to: ${targetPath}`);
      return true;
    } catch (error) {
      this.log(`❌ Failed to export logs: ${error}`);
      return false;
    }
  }

  /**
   * Close browser and cleanup resources
   */
  async close(): Promise<void> {
    try {
      // Log blocked resources summary before closing
      this.logBlockedStatsSummary();
      
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      this.isAuthenticated = false;
      this.log('🧹 Optimized browser resources cleaned up');
      this.log(`📄 Debug session log saved to: ${this.logFile}`);
      
    } catch (error) {
      this.log(`⚠️  Error during cleanup: ${error}`);
    }
  }
} 