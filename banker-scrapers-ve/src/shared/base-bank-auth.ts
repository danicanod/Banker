/**
 * Abstract Base Bank Authentication Class
 * 
 * This abstract class provides common functionality for all bank authentication
 * implementations, including browser management, logging, error handling, and
 * common configuration patterns.
 */

import { Browser, Page, Frame, chromium, BrowserContext } from 'playwright';
import type { BaseBankAuthConfig, BaseBankLoginResult, BaseBankCredentials } from './types/index.js';
import { 
  PerformanceConfig, 
  getBankPerformanceConfig, 
  getBlockedDomains, 
  isEssentialJS
} from './performance-config.js';
import { createLogger, truncateForLog, type LogLevel, type Logger } from './utils/logger.js';

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
  protected bankName: string;
  protected performanceConfig: PerformanceConfig;
  protected logger: Logger;
  
  /** Aggregated blocked request stats (summary logged once on close) */
  private blockedStats: BlockedRequestStats = this.createEmptyBlockedStats();
  private blockedStatsSummaryLogged: boolean = false;

  constructor(bankName: string, credentials: TCredentials, config: TConfig) {
    this.bankName = bankName;
    this.credentials = credentials;
    
    // Set up default configuration - subclasses can override specific defaults
    this.config = this.getDefaultConfig(config);
    
    // Initialize logger with configured level (default: warn for production safety)
    const logLevel = (config as any).logLevel ?? 'warn';
    this.logger = createLogger(`${bankName}Auth`, { level: logLevel as LogLevel });
    
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
    
    this.logger.info(`${bankName} Auth initialized for user: ${this.getUserIdentifier()}`);
    this.logger.debug(`Performance config: CSS:${this.performanceConfig.blockCSS}, IMG:${this.performanceConfig.blockImages}, JS:${this.performanceConfig.blockNonEssentialJS}`);
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
      saveSession: false, // Disabled by default for security
      logLevel: 'warn',
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
    this.logger.debug(`Blocked resources: ${total}${breakdown}`);
  }

  /**
   * Pause execution for debugging with Playwright debugger
   * Only pauses if debug mode is enabled
   */
  protected async debugPause(message: string): Promise<void> {
    if (this.config.debug && this.page) {
      this.logger.debug(`DEBUG PAUSE: ${message}`);
      await this.page.pause();
    }
  }

  /**
   * Wait for element to be ready (visible and enabled) on page
   */
  protected async waitForElementReady(selector: string, timeout: number = 10000): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      await this.page.waitForSelector(selector, { timeout });
      
      await this.page.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null &&
                 !element.hasAttribute('disabled');
        },
        selector,
        { timeout }
      );
      
      return true;
    } catch (error) {
      this.logger.debug(`Element not ready: ${selector}`);
      return false;
    }
  }

  /**
   * Wait for element to be ready (visible and enabled) on frame
   */
  protected async waitForElementReadyOnFrame(frame: Frame, selector: string, timeout: number = 10000): Promise<boolean> {
    try {
      await frame.waitForSelector(selector, { timeout });
      
      await frame.waitForFunction(
        (sel) => {
          const element = document.querySelector(sel) as HTMLElement;
          return element && 
                 element.offsetParent !== null &&
                 !element.hasAttribute('disabled');
        },
        selector,
        { timeout }
      );
      
      return true;
    } catch (error) {
      this.logger.debug(`Element not ready on frame: ${selector}`);
      return false;
    }
  }

  /**
   * Wait for navigation completion by checking for new content
   */
  protected async waitForNavigation(expectedSelectors: string[] = [], timeout: number = 15000): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      // First try immediate check
      for (const selector of expectedSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && await element.isVisible()) {
            this.logger.debug(`Navigation detected: found ${selector}`);
            return true;
          }
        } catch (e) {
          // Continue checking
        }
      }
      
      // Wait for any of the expected selectors
      if (expectedSelectors.length > 0) {
        try {
          await Promise.race(
            expectedSelectors.map(selector => 
              this.page!.waitForSelector(selector, { timeout })
            )
          );
          return true;
        } catch (raceError) {
          this.logger.debug('Expected elements not found');
        }
      }
      
      // Fallback: wait for load state
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        return true;
      } catch (loadError) {
        this.logger.debug('Load state timeout');
      }
      
      return true;
      
    } catch (error) {
      this.logger.warn('Navigation timeout');
      return false;
    }
  }

  /**
   * Setup request interception for performance optimizations
   */
  protected async setupRequestInterception(page: Page): Promise<void> {
    this.logger.debug('Setting up performance optimizations...');
    
    const blockedDomains = getBlockedDomains(this.performanceConfig);
    
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();
      
      const shouldBlockDomain = blockedDomains.some(domain => url.includes(domain));
      
      if (shouldBlockDomain) {
        this.blockedStats.total++;
        this.blockedStats.byCategory.tracking++;
        await route.abort();
        return;
      }
      
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
      
      if (this.performanceConfig.blockNonEssentialJS && resourceType === 'script') {
        if (!isEssentialJS(url, this.bankName)) {
          this.blockedStats.total++;
          this.blockedStats.byCategory.nonEssentialJs++;
          await route.abort();
          return;
        }
      }
      
      await route.continue();
    });
    
    this.logger.debug(`Performance optimizations active - ${blockedDomains.length} domains blocked`);
  }

  /**
   * Initialize Playwright browser and page with performance optimizations
   */
  protected async initializeBrowser(): Promise<void> {
    this.logger.info('Initializing browser...');
    
    this.resetBlockedStats();
    
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection'
    ];
    
    if (this.config.headless) {
      launchArgs.push(
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
      }
    });

    this.page = await this.context.newPage();
    
    await this.setupRequestInterception(this.page);
    
    await this.page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });
    
    this.page.setDefaultTimeout(this.config.timeout || 30000);
    this.page.setDefaultNavigationTimeout(this.config.timeout || 30000);
    
    this.logger.debug(`Browser initialized: Viewport: 1366x768, Headless: ${this.config.headless}, Timeout: ${this.config.timeout}ms`);
  }

  /**
   * Main login method template - implements common flow
   */
  async login(): Promise<TLoginResult> {
    this.logger.info(`Starting ${this.bankName} authentication...`);
    
    try {
      if (!this.browser || !this.page) {
        await this.initializeBrowser();
      }
      
      if (!this.page) {
        throw new Error('Failed to initialize browser page');
      }

      await this.debugPause('Browser initialized - ready to navigate to login page');

      this.logger.debug(`Navigating to ${this.bankName} login page...`);
      await this.page.goto(this.getLoginUrl(), { 
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout 
      });

      await this.debugPause('Login page loaded - ready to start authentication');

      const loginSuccess = await this.performBankSpecificLogin();
      
      if (loginSuccess) {
        this.isAuthenticated = true;
        this.logger.info(`${this.bankName} authentication successful`);
        
        await this.debugPause('Login completed successfully');
        
        return this.createSuccessResult();
      } else {
        return this.createFailureResult('Authentication failed');
      }

    } catch (error: any) {
      this.logger.error(`Authentication error: ${error.message || error}`);
      await this.debugPause(`Error occurred: ${error.message}`);
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
   * Close browser and cleanup resources
   */
  async close(): Promise<void> {
    try {
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
      this.logger.debug('Browser resources cleaned up');
      
    } catch (error) {
      this.logger.warn(`Error during cleanup: ${error}`);
    }
  }
}
