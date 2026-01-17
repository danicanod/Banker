/**
 * BNC Authentication with Playwright
 * 
 * This module provides authentication functionality for BNC online banking
 * using the abstract BaseBankAuth class with BNC-specific implementation
 * of the 3-step authentication process (Card → User ID → Password).
 */

import type { BncCredentials, BncLoginResult, BncAuthConfig } from '../types/index.js';
import { BNC_URLS, BNC_SELECTORS } from '../types/index.js';
import { BaseBankAuth } from '../../../shared/base-bank-auth.js';

export class BncAuth extends BaseBankAuth<BncCredentials, BncAuthConfig, BncLoginResult> {
  constructor(credentials: BncCredentials, config: BncAuthConfig = {}) {
    super('BNC', credentials, config);
  }

  /**
   * Get default configuration with BNC-specific defaults
   */
  protected getDefaultConfig(config: BncAuthConfig): Required<BncAuthConfig> {
    return {
      headless: false,
      timeout: 30000,
      debug: false,
      saveSession: true,
      retries: 3,        // BNC-specific default
      ...config
    } as Required<BncAuthConfig>;
  }

  /**
   * Get user identifier for logging (safe/truncated)
   */
  protected getUserIdentifier(): string {
    return this.credentials.id.substring(0, 3);
  }

  /**
   * Get the BNC login URL
   */
  protected getLoginUrl(): string {
    return BNC_URLS.LOGIN;
  }

  /**
   * Perform BNC-specific login with retry logic
   */
  protected async performBankSpecificLogin(): Promise<boolean> {
    let attempt = 1;
    const maxRetries = this.config.retries;
    
    while (attempt <= maxRetries) {
      try {
        this.log(`🔄 Login attempt ${attempt}/${maxRetries}`);
        
        const loginSuccess = await this.performLogin();
        
        if (loginSuccess) {
          return true;
        } else {
          this.log(`❌ Attempt ${attempt} failed - login process returned false`);
          
          if (attempt < maxRetries) {
            this.log('⏳ Waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Close current session before retry
            if (this.browser) {
              await this.browser.close();
              this.browser = null;
              this.page = null;
            }
            
            // Re-initialize for retry
            await this.initializeBrowser();
            if (this.page) {
              await this.page.goto(this.getLoginUrl(), { 
                waitUntil: 'domcontentloaded',
                timeout: this.config.timeout 
              });
            }
          }
          
          attempt++;
        }

      } catch (error: any) {
        this.log(`💥 Attempt ${attempt} error: ${error.message || error}`);
        
        await this.debugPause(`Error occurred: ${error.message} - inspect page state`);
        
        if (attempt < maxRetries) {
          this.log('⏳ Waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Close current session before retry
          if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
          }
          
          // Re-initialize for retry
          await this.initializeBrowser();
          if (this.page) {
            await this.page.goto(this.getLoginUrl(), { 
              waitUntil: 'domcontentloaded',
              timeout: this.config.timeout 
            });
          }
        }
        
        attempt++;
      }
    }
    
    return false;
  }

  /**
   * Perform the actual login process
   */
  private async performLogin(): Promise<boolean> {
    if (!this.page) return false;
    
    this.log('🔐 Starting login process...');

    try {
      // Step 1: Enter card number and user ID
      this.log('💳 Entering card number and user ID...');
      await this.enterInitialCredentials();
      
      await this.debugPause('Initial credentials entered - ready to submit first form');

      // Step 2: Submit first form to get password field
      this.log('🔄 Submitting first form...');
      await this.submitFirstForm();
      
      await this.debugPause('First form submitted - waiting for password field');

      // Step 3: Wait for password field and enter password
      this.log('🔑 Waiting for password field...');
      const passwordReady = await this.waitForElementReady(BNC_SELECTORS.PASSWORD, 20000);
      
      if (!passwordReady) {
        throw new Error('Password field did not appear');
      }

      this.log('🔑 Entering password...');
      await this.enterPassword();
      
      await this.debugPause('Password entered - ready to submit final form');

      // Step 4: Submit final form
      this.log('🔄 Submitting login form...');
      await this.submitLoginForm();

      // Step 5: Verify login success
      return await this.verifyLoginSuccess();

    } catch (error) {
      this.log(`❌ Login process failed: ${error}`);
      return false;
    }
  }

  /**
   * Enter initial credentials (card and user ID)
   */
  private async enterInitialCredentials(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Wait for and fill card number
    const cardReady = await this.waitForElementReady(BNC_SELECTORS.CARD_NUMBER);
    if (!cardReady) {
      throw new Error('Card number field not ready');
    }
    
    await this.page.fill(BNC_SELECTORS.CARD_NUMBER, this.credentials.card);
    this.log('✅ Card number entered');
    
    // Wait for and fill user ID
    const userIdReady = await this.waitForElementReady(BNC_SELECTORS.USER_ID);
    if (!userIdReady) {
      throw new Error('User ID field not ready');
    }
    
    await this.page.fill(BNC_SELECTORS.USER_ID, this.credentials.id);
    this.log('✅ User ID entered');
  }

  /**
   * Submit first form to proceed to password step
   */
  private async submitFirstForm(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    const submitReady = await this.waitForElementReady(BNC_SELECTORS.SUBMIT_BUTTON);
    if (!submitReady) {
      throw new Error('Submit button not ready');
    }
    
    // Click submit button first, then wait for password field
    // Note: Using sequential await instead of Promise.all because the
    // AJAX call triggered by click must complete before password appears
    await this.page.click(BNC_SELECTORS.SUBMIT_BUTTON);
    await this.page.waitForTimeout(500); // Brief pause for AJAX to start
    await this.page.waitForSelector(BNC_SELECTORS.PASSWORD, { timeout: 20000 });
    
    this.log('✅ First form submitted successfully');
  }

  /**
   * Enter password
   */
  private async enterPassword(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Clear field first and then type with delay
    await this.page.fill(BNC_SELECTORS.PASSWORD, '');
    await this.page.type(BNC_SELECTORS.PASSWORD, this.credentials.password, { delay: 100 });
    this.log('✅ Password entered');
  }

  /**
   * Submit login form
   */
  private async submitLoginForm(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    await Promise.all([
      this.page.click(BNC_SELECTORS.SUBMIT_BUTTON),
      this.waitForNavigation()
    ]);
    
    this.log('✅ Login form submitted');
  }

  /**
   * Verify if login was successful using BNC-specific indicators
   */
  protected async verifyLoginSuccess(): Promise<boolean> {
    if (!this.page) return false;

    try {
      this.log('🔍 Verifying login success...');
      
      // Wait for navigation
      await this.page.waitForTimeout(3000);
      
      const currentUrl = this.page.url();
      this.log(`📍 Current URL: ${currentUrl}`);
      
      // Check for successful login indicators
      const successUrlPatterns = [
        'dashboard',
        'main',
        'home',
        'menu',
        'accounts'
      ];
      
      const urlBasedSuccess = successUrlPatterns.some(pattern => 
        currentUrl.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (urlBasedSuccess) {
        this.log('✅ Login verification successful by URL pattern');
        return true;
      }
      
      // Check for logout button presence (indicates successful login)
      try {
        const logoutButton = await this.page.waitForSelector(BNC_SELECTORS.LOGOUT_BUTTON, { timeout: 5000 });
        if (logoutButton && await logoutButton.isVisible()) {
          this.log('✅ Login verified by logout button presence');
          return true;
        }
      } catch (e) {
        // Continue with other checks
      }
      
      // Check if we're NOT on login page anymore
      const isStillOnLoginPage = await this.page.$(BNC_SELECTORS.CARD_NUMBER);
      if (!isStillOnLoginPage) {
        this.log('✅ Login verified - no longer on login page');
        return true;
      }
      
      this.log('❌ Login verification failed - still appears to be on login page');
      return false;
      
    } catch (error) {
      this.log(`❌ Error during login verification: ${error}`);
      return false;
    }
  }

  /**
   * Create BNC-specific success result
   */
  protected createSuccessResult(): BncLoginResult {
    return {
      success: true,
      message: 'Authentication successful',
      sessionValid: true,
      userInfo: {
        id: this.credentials.id,
        cardNumber: this.credentials.card.substring(0, 4) + '****'
      }
    };
  }

  /**
   * Create BNC-specific failure result
   */
  protected createFailureResult(message: string): BncLoginResult {
    return {
      success: false,
      message,
      sessionValid: false,
      error: message
    };
  }

  /**
   * Get credentials for logging purposes (safe)
   */
  getCredentials(): { id: string } {
    return { id: this.credentials.id };
  }

  /**
   * Logout from BNC
   */
  async logout(): Promise<boolean> {
    if (!this.page || !this.isAuthenticated) {
      this.log('⚠️  Not authenticated, cannot logout');
      return false;
    }

    try {
      this.log('🚪 Starting logout process...');
      
      // Click logout button
      await this.page.click(BNC_SELECTORS.LOGOUT_BUTTON);
      
      // Wait for confirmation modal
      await this.page.waitForSelector(BNC_SELECTORS.LOGOUT_MODAL, { timeout: 5000 });
      
      // Click confirm button
      const confirmButton = await this.page.$(BNC_SELECTORS.LOGOUT_CONFIRM);
      if (confirmButton) {
        await Promise.all([
          confirmButton.click(),
          this.waitForNavigation()
        ]);
        
        this.isAuthenticated = false;
        this.log('✅ Logout successful');
        return true;
      } else {
        throw new Error('Logout confirmation button not found');
      }
      
    } catch (error) {
      this.log(`❌ Logout failed: ${error}`);
      return false;
    }
  }

  /**
   * Close browser and cleanup resources (override to include logout)
   */
  async close(): Promise<void> {
    try {
      if (this.isAuthenticated) {
        await this.logout();
      }
      
      // Call parent cleanup
      await super.close();
      
    } catch (error) {
      this.log(`⚠️  Error during cleanup: ${error}`);
    }
  }
} 