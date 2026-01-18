/**
 * Banesco Authentication with Playwright
 * 
 * This module provides authentication functionality for Banesco online banking
 * using the abstract BaseBankAuth class with Banesco-specific implementation
 * of security questions, iframe handling, and modal management.
 */
import { SecurityQuestionsHandler } from './security-questions.js';
import { BaseBankAuth } from '../../../shared/base-bank-auth.js';
import { truncateForLog } from '../../../shared/utils/logger.js';
import { Frame } from 'playwright';
import {
  BanescoCredentials,
  BanescoLoginResult,
  BanescoAuthConfig,
  BANESCO_URLS
} from '../types/index.js';

export class BanescoAuth extends BaseBankAuth<
  BanescoCredentials, 
  BanescoAuthConfig, 
  BanescoLoginResult
> {
  private securityHandler: SecurityQuestionsHandler;

  constructor(credentials: BanescoCredentials, config: BanescoAuthConfig = {}) {
    super('Banesco', credentials, config);
    
    // Pass the log level to security handler
    this.securityHandler = new SecurityQuestionsHandler(
      credentials.securityQuestions,
      { logLevel: (config as any).logLevel ?? 'warn' }
    );
  }

  /**
   * Get default configuration with Banesco-specific defaults
   */
  protected getDefaultConfig(config: BanescoAuthConfig): Required<BanescoAuthConfig> {
    return {
      headless: false,
      timeout: 30000,
      debug: false,
      saveSession: false, // Disabled by default for security
      logLevel: 'warn',
      ...config
    } as Required<BanescoAuthConfig>;
  }

  /**
   * Get user identifier for logging (safe/truncated)
   */
  protected getUserIdentifier(): string {
    return truncateForLog(this.credentials.username, 3);
  }

  /**
   * Get the Banesco login URL
   */
  protected getLoginUrl(): string {
    return BANESCO_URLS.LOGIN;
  }

  /**
   * Perform Banesco-specific login with iframe handling
   */
  protected async performBankSpecificLogin(): Promise<boolean> {
    try {
      this.logger.debug('Waiting for login iframe...');
      const frame = await this.waitForLoginIframe();
      
      if (!frame) {
        throw new Error('Could not access login iframe');
      }

      await this.debugPause('Login iframe ready');

      const loginSuccess = await this.performLogin(frame);
      
      if (loginSuccess) {
        return await this.verifyLoginSuccess();
      }
      
      return false;

    } catch (error) {
      this.logger.error(`Bank-specific login failed: ${error}`);
      return false;
    }
  }

  /**
   * Wait for the login iframe to be available
   */
  private async waitForLoginIframe(): Promise<Frame | null> {
    if (!this.page) return null;

    try {
      await this.page.waitForSelector(BANESCO_URLS.IFRAME_SELECTOR, {
        timeout: this.config.timeout
      });

      const iframeElement = await this.page.$(BANESCO_URLS.IFRAME_SELECTOR);
      if (!iframeElement) {
        throw new Error('Iframe element not found');
      }

      const frame = await iframeElement.contentFrame();
      if (!frame) {
        throw new Error('Could not access iframe content');
      }

      await frame.waitForLoadState('domcontentloaded');
      
      this.logger.debug('Waiting for iframe content to render...');
      await this.page.waitForTimeout(2000);
      
      try {
        await frame.waitForSelector('#ctl00_cp_ddpControles_txtloginname', { 
          timeout: 15000,
          state: 'visible'
        });
        this.logger.debug('Username field detected in iframe');
      } catch (fieldError) {
        const frameContent = await frame.content();
        const hasForm = frameContent.includes('txtloginname') || frameContent.includes('txtUsuario');
        this.logger.debug(`Form elements in HTML: ${hasForm}`);
        
        const alternateSelectors = [
          'input[type="text"]',
          'input[name*="login"]',
          'input[name*="usuario"]',
          '#txtUsuario'
        ];
        
        for (const sel of alternateSelectors) {
          try {
            const el = await frame.$(sel);
            if (el) {
              this.logger.debug(`Found alternate field: ${sel}`);
              break;
            }
          } catch { /* continue */ }
        }
      }
      
      this.logger.debug('Login iframe ready');
      return frame;

    } catch (error) {
      this.logger.error(`Failed to access login iframe: ${error}`);
      return null;
    }
  }

  /**
   * Perform the login process within the iframe
   */
  private async performLogin(frame: Frame): Promise<boolean> {
    this.logger.debug('Starting login process...');

    try {
      // Step 1: Enter username and submit
      this.logger.debug('Step 1: Entering username...');
      await this.enterUsernameAndSubmit(frame);
      
      await this.debugPause('Username submitted');

      // Step 2: Wait for next step
      this.logger.debug('Waiting for next step...');
      await this.page?.waitForTimeout(3000);
      
      const newFrame = await this.getRefreshedFrame();
      if (!newFrame) {
        throw new Error('Lost iframe after username submission');
      }

      // Step 3: Check for security questions
      this.logger.debug('Step 2: Checking for security questions...');
      const hasSecurityQuestions = await this.checkForSecurityQuestions(newFrame);
      
      if (hasSecurityQuestions) {
        this.logger.debug('Security questions answered, submitting...');
        await this.clickSubmitButton(newFrame);
        await this.page?.waitForTimeout(2000);
      }

      // Step 4: Enter password
      const passwordFrame = await this.getRefreshedFrame();
      if (!passwordFrame) {
        throw new Error('Lost iframe before password step');
      }
      
      this.logger.debug('Step 3: Entering password...');
      await this.enterPasswordAndSubmit(passwordFrame);

      this.logger.debug('Login form submitted');
      return true;

    } catch (error) {
      this.logger.error(`Login process failed: ${error}`);
      return false;
    }
  }

  /**
   * Get a fresh reference to the iframe
   */
  private async getRefreshedFrame(): Promise<Frame | null> {
    if (!this.page) return null;
    
    try {
      const iframeElement = await this.page.$(BANESCO_URLS.IFRAME_SELECTOR);
      if (!iframeElement) return null;
      
      const frame = await iframeElement.contentFrame();
      if (frame) {
        await frame.waitForLoadState('domcontentloaded').catch(() => {});
      }
      return frame;
    } catch {
      return null;
    }
  }

  /**
   * Enter username and click submit button
   */
  private async enterUsernameAndSubmit(frame: Frame): Promise<void> {
    const usernameSelectors = [
      'input[id*="txtUsuario"]',
      'input[id*="txtloginname"]',
      '#ctl00_cp_ddpControles_txtloginname',
      'input[type="text"]'
    ];
    
    this.logger.debug('Looking for username field...');
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        const element = await frame.$(selector);
        if (element && await element.isVisible()) {
          usernameField = element;
          this.logger.debug(`Found username field: ${selector}`);
          break;
        }
      } catch { continue; }
    }
    
    if (!usernameField) {
      throw new Error('Username field not found');
    }
    
    await usernameField.fill(this.credentials.username);
    this.logger.debug('Username entered');
    
    await this.clickSubmitButton(frame);
  }

  /**
   * Enter password and click submit button
   */
  private async enterPasswordAndSubmit(frame: Frame): Promise<void> {
    await frame.page().waitForTimeout(1500);
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[id*="txtclave"]',
      'input[id*="txtClave"]',
      'input[id*="password"]',
      '#ctl00_cp_ddpControles_txtclave'
    ];
    
    this.logger.debug('Looking for password field...');
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        const element = await frame.$(selector);
        if (element && await element.isVisible()) {
          passwordField = element;
          this.logger.debug(`Found password field: ${selector}`);
          break;
        }
      } catch { continue; }
    }
    
    if (!passwordField) {
      const inputs = await frame.$$('input');
      this.logger.debug(`No password field found. Visible inputs: ${inputs.length}`);
      
      const content = await frame.content();
      const pageText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
      
      if (pageText.includes('sesión') || pageText.includes('conexión activa')) {
        this.logger.debug('Detected active session warning, clicking to continue...');
        await this.clickSubmitButton(frame);
        await frame.page().waitForTimeout(3000);
        
        const newFrame = await this.getRefreshedFrame();
        if (newFrame) {
          await newFrame.waitForLoadState('domcontentloaded').catch(() => {});
          
          for (const selector of passwordSelectors) {
            try {
              const element = await newFrame.$(selector);
              if (element && await element.isVisible()) {
                passwordField = element;
                this.logger.debug(`Found password field after warning: ${selector}`);
                break;
              }
            } catch { continue; }
          }
          
          if (!passwordField) {
            this.logger.debug('Checking for security questions after session warning...');
            const hasSecurityQuestions = await this.checkForSecurityQuestions(newFrame);
            if (hasSecurityQuestions) {
              await this.clickSubmitButton(newFrame);
              await frame.page().waitForTimeout(2000);
              
              const finalFrame = await this.getRefreshedFrame();
              if (finalFrame) {
                for (const selector of passwordSelectors) {
                  try {
                    const element = await finalFrame.$(selector);
                    if (element && await element.isVisible()) {
                      passwordField = element;
                      this.logger.debug(`Found password field after security questions: ${selector}`);
                      break;
                    }
                  } catch { continue; }
                }
              }
            }
          }
        }
      }
      
      if (!passwordField) {
        throw new Error('Password field not found');
      }
    }
    
    await passwordField.fill(this.credentials.password);
    this.logger.debug('Password entered');
    
    await this.clickSubmitButton(frame);
  }

  /**
   * Click the submit/Aceptar button
   */
  private async clickSubmitButton(frame: Frame): Promise<void> {
    const submitSelectors = [
      'input[value="Aceptar"]',
      'input[id*="btnAcceder"]',
      '#ctl00_cp_ddpControles_btnAcceder',
      'input[type="submit"]',
      'button[type="submit"]'
    ];
    
    for (const selector of submitSelectors) {
      try {
        const element = await frame.$(selector);
        if (element && await element.isVisible()) {
          this.logger.debug(`Clicking submit: ${selector}`);
          await element.click();
          return;
        }
      } catch { continue; }
    }
    
    throw new Error('Submit button not found');
  }

  /**
   * Check for and handle security questions
   */
  private async checkForSecurityQuestions(frame: Frame): Promise<boolean> {
    try {
      const securitySelectors = [
        '#ctl00_cp_ddpControles_txtpreguntasecreta',
        'input[id*="pregunta"]',
        'input[id*="Pregunta"]',
        'input[id*="respuesta"]',
        'input[id*="Respuesta"]',
        'input[name*="pregunta"]'
      ];
      
      let securityField = null;
      for (const selector of securitySelectors) {
        try {
          const el = await frame.$(selector);
          if (el && await el.isVisible()) {
            securityField = el;
            this.logger.debug(`Found security field: ${selector}`);
            break;
          }
        } catch { continue; }
      }
      
      const frameContent = await frame.content();
      const hasSecurityText = frameContent.toLowerCase().includes('pregunta') && 
                              frameContent.toLowerCase().includes('seguridad');
      
      if (!securityField && !hasSecurityText) {
        this.logger.debug('No security questions detected');
        return false;
      }

      this.logger.debug('Security question detected, handling...');
      
      const answered = await this.securityHandler.handleSecurityQuestions(frame);
      
      if (answered) {
        this.logger.debug('Security question answered successfully');
        return true;
      } else {
        this.logger.warn('Could not answer security question');
        return false;
      }

    } catch (error) {
      this.logger.debug(`Security question handling error: ${error}`);
      return false;
    }
  }

  /**
   * Verify if login was successful
   */
  protected async verifyLoginSuccess(): Promise<boolean> {
    if (!this.page) return false;

    try {
      this.logger.debug('Verifying login success...');
      
      await this.page.waitForTimeout(5000);
      
      const currentUrl = this.page.url();
      this.logger.debug(`Current URL: ${currentUrl}`);
      
      const successUrlPatterns = [
        'default.aspx',
        'Default.aspx',
        'Principal.aspx',
        'Dashboard',
        'Home',
        'WebSite/Default'
      ];
      
      const failurePatterns = [
        'Login.aspx',
        'login.aspx',
        'CAU/inicio',
        'LoginDNA'
      ];
      
      const urlLower = currentUrl.toLowerCase();
      
      const urlBasedSuccess = successUrlPatterns.some(pattern => 
        urlLower.includes(pattern.toLowerCase())
      );
      
      const stillOnLogin = failurePatterns.some(pattern =>
        urlLower.includes(pattern.toLowerCase())
      );
      
      if (urlBasedSuccess && !stillOnLogin) {
        this.logger.debug('Login verification successful by URL pattern');
        return true;
      }
      
      try {
        const pageContent = await this.page.content();
        const authenticatedIndicators = [
          'Cerrar Sesión',
          'cerrar sesion',
          'Salir',
          'Bienvenido',
          'Mi cuenta',
          'Saldo disponible',
          'Consulta de saldos'
        ];
        
        for (const indicator of authenticatedIndicators) {
          if (pageContent.toLowerCase().includes(indicator.toLowerCase())) {
            this.logger.debug(`Login verified by content indicator: "${indicator}"`);
            return true;
          }
        }
      } catch (e) {
        // Continue with other checks
      }
      
      if (!stillOnLogin) {
        this.logger.debug('Login appears successful - no longer on login page');
        return true;
      }
      
      this.logger.warn('Login verification failed - still on login page');
      return false;
      
    } catch (error) {
      this.logger.error(`Error during login verification: ${error}`);
      return false;
    }
  }

  /**
   * Create Banesco-specific success result
   */
  protected createSuccessResult(): BanescoLoginResult {
    return {
      success: true,
      message: 'Authentication successful',
      sessionValid: true,
      systemMessage: 'Banesco online banking session established'
    };
  }

  /**
   * Create Banesco-specific failure result
   */
  protected createFailureResult(message: string): BanescoLoginResult {
    return {
      success: false,
      message,
      sessionValid: false,
      error: message,
      systemMessage: 'Authentication failed'
    };
  }

  /**
   * Get credentials for logging purposes (safe)
   */
  getCredentials(): { username: string } {
    return { username: truncateForLog(this.credentials.username, 3) };
  }
}
