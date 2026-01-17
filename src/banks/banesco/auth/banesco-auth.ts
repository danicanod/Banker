/**
 * Banesco Authentication with Playwright
 * 
 * This module provides authentication functionality for Banesco online banking
 * using the abstract BaseBankAuth class with Banesco-specific implementation
 * of security questions, iframe handling, and modal management.
 */
import { SecurityQuestionsHandler } from './security-questions.js';
import { BaseBankAuth } from '../../../shared/base-bank-auth.js';
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
    
    this.securityHandler = new SecurityQuestionsHandler(
      credentials.securityQuestions
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
      saveSession: true,
      ...config
    } as Required<BanescoAuthConfig>;
  }

  /**
   * Get user identifier for logging (safe/truncated)
   */
  protected getUserIdentifier(): string {
    return this.credentials.username.substring(0, 3);
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
      // Wait for the login iframe to be available
      this.log('🔍 Waiting for login iframe...');
      const frame = await this.waitForLoginIframe();
      
      if (!frame) {
        throw new Error('Could not access login iframe');
      }

      await this.debugPause('Login iframe ready - ready to start authentication');

      // Perform the login process within the iframe
      const loginSuccess = await this.performLogin(frame);
      
      if (loginSuccess) {
        return await this.verifyLoginSuccess();
      }
      
      return false;

    } catch (error) {
      this.log(`❌ Bank-specific login failed: ${error}`);
      return false;
    }
  }

  /**
   * Wait for the login iframe to be available
   */
  private async waitForLoginIframe(): Promise<Frame | null> {
    if (!this.page) return null;

    try {
      // Wait for iframe element
      await this.page.waitForSelector(BANESCO_URLS.IFRAME_SELECTOR, {
        timeout: this.config.timeout
      });

      // Get the iframe
      const iframeElement = await this.page.$(BANESCO_URLS.IFRAME_SELECTOR);
      if (!iframeElement) {
        throw new Error('Iframe element not found');
      }

      // Get the frame content
      const frame = await iframeElement.contentFrame();
      if (!frame) {
        throw new Error('Could not access iframe content');
      }

      // Wait for frame to be ready - use networkidle for dynamic content
      await frame.waitForLoadState('domcontentloaded');
      
      // Give extra time for dynamic content to render
      this.log('⏳ Waiting for iframe content to fully render...');
      await this.page.waitForTimeout(2000);
      
      // Try to wait for the username field specifically inside the frame
      try {
        await frame.waitForSelector('#ctl00_cp_ddpControles_txtloginname', { 
          timeout: 15000,
          state: 'visible'
        });
        this.log('✅ Username field detected in iframe');
      } catch (fieldError) {
        // Log what we can see in the frame for debugging
        const frameContent = await frame.content();
        const hasForm = frameContent.includes('txtloginname') || frameContent.includes('txtUsuario');
        this.log(`⚠️ Username field not immediately visible. Form elements in HTML: ${hasForm}`);
        
        // Try alternate selectors
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
              this.log(`✅ Found alternate field with selector: ${sel}`);
              break;
            }
          } catch { /* continue */ }
        }
      }
      
      this.log('✅ Login iframe ready');
      return frame;

    } catch (error) {
      this.log(`❌ Failed to access login iframe: ${error}`);
      return null;
    }
  }

  /**
   * Perform the login process within the iframe
   * Banesco has a multi-step flow:
   * Step 1: Username → Click Aceptar
   * Step 2: Security questions (if shown) → Click Aceptar  
   * Step 3: Password → Click Aceptar
   */
  private async performLogin(frame: Frame): Promise<boolean> {
    this.log('🔐 Starting login process...');

    try {
      // Step 1: Enter username and submit
      this.log('👤 Step 1: Entering username...');
      await this.enterUsernameAndSubmit(frame);
      
      await this.debugPause('Username submitted - waiting for next step');

      // Step 2: Wait for next step and get fresh frame reference
      this.log('⏳ Waiting for next step to load...');
      await this.page?.waitForTimeout(3000);
      
      // Re-get the iframe as it may have reloaded
      const newFrame = await this.getRefreshedFrame();
      if (!newFrame) {
        throw new Error('Lost iframe after username submission');
      }

      // Step 3: Check for security questions
      this.log('❓ Step 2: Checking for security questions...');
      const hasSecurityQuestions = await this.checkForSecurityQuestions(newFrame);
      
      if (hasSecurityQuestions) {
        this.log('🔐 Security questions answered, submitting...');
        await this.clickSubmitButton(newFrame);
        await this.page?.waitForTimeout(2000);
      }

      // Step 4: Get fresh frame and enter password
      const passwordFrame = await this.getRefreshedFrame();
      if (!passwordFrame) {
        throw new Error('Lost iframe before password step');
      }
      
      this.log('🔑 Step 3: Entering password...');
      await this.enterPasswordAndSubmit(passwordFrame);

      this.log('✅ Login form submitted successfully');
      return true;

    } catch (error) {
      this.log(`❌ Login process failed: ${error}`);
      return false;
    }
  }

  /**
   * Get a fresh reference to the iframe (it may reload between steps)
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
   * Enter username and click submit button (Step 1)
   */
  private async enterUsernameAndSubmit(frame: Frame): Promise<void> {
    // Find and fill username
    const usernameSelectors = [
      'input[id*="txtUsuario"]',
      'input[id*="txtloginname"]',
      '#ctl00_cp_ddpControles_txtloginname',
      'input[type="text"]'
    ];
    
    this.log('🔍 Looking for username field...');
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        const element = await frame.$(selector);
        if (element && await element.isVisible()) {
          usernameField = element;
          this.log(`✅ Found username field: ${selector}`);
          break;
        }
      } catch { continue; }
    }
    
    if (!usernameField) {
      throw new Error('Username field not found');
    }
    
    // Type username quickly
    await usernameField.fill(this.credentials.username);
    this.log('✅ Username entered');
    
    // Click submit button
    await this.clickSubmitButton(frame);
  }

  /**
   * Enter password and click submit button (Step 3)
   */
  private async enterPasswordAndSubmit(frame: Frame): Promise<void> {
    // Wait for password field to appear
    await frame.page().waitForTimeout(1500);
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[id*="txtclave"]',
      'input[id*="txtClave"]',
      'input[id*="password"]',
      '#ctl00_cp_ddpControles_txtclave'
    ];
    
    this.log('🔍 Looking for password field...');
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        const element = await frame.$(selector);
        if (element && await element.isVisible()) {
          passwordField = element;
          this.log(`✅ Found password field: ${selector}`);
          break;
        }
      } catch { continue; }
    }
    
    if (!passwordField) {
      // Debug what we see
      const inputs = await frame.$$('input');
      this.log(`⚠️ No password field found. Visible inputs: ${inputs.length}`);
      for (const inp of inputs.slice(0, 5)) {
        const t = await inp.getAttribute('type');
        const id = await inp.getAttribute('id');
        this.log(`   - type=${t}, id=${id}`);
      }
      
      // Get page text for debugging
      const content = await frame.content();
      const textContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 500);
      this.log(`   📄 Page preview: ${textContent.substring(0, 200)}...`);
      
      // Check if this is a confirmation/warning page that needs a click
      const pageText = textContent.toLowerCase();
      if (pageText.includes('sesión') || pageText.includes('conexión activa') || pageText.includes('abierta') || pageText.includes('activa')) {
        this.log('   ⚠️ Detected active session warning, clicking Aceptar to continue...');
        await this.clickSubmitButton(frame);
        await frame.page().waitForTimeout(3000);
        
        // Re-get the iframe as it may have reloaded
        const newFrame = await this.getRefreshedFrame();
        if (newFrame) {
          // Wait for content to load
          await newFrame.waitForLoadState('domcontentloaded').catch(() => {});
          
          // Try to find password field again after clicking
          for (const selector of passwordSelectors) {
            try {
              const element = await newFrame.$(selector);
              if (element && await element.isVisible()) {
                passwordField = element;
                this.log(`✅ Found password field after warning: ${selector}`);
                // Update frame reference for subsequent operations
                Object.assign(frame, newFrame);
                break;
              }
            } catch { continue; }
          }
          
          // If still no password, might need to restart login from security questions
          if (!passwordField) {
            this.log('   🔄 Checking for security questions after session warning...');
            const hasSecurityQuestions = await this.checkForSecurityQuestions(newFrame);
            if (hasSecurityQuestions) {
              this.log('   ✅ Security questions found, answers provided');
              await this.clickSubmitButton(newFrame);
              await frame.page().waitForTimeout(2000);
              
              // One more try for password field
              const finalFrame = await this.getRefreshedFrame();
              if (finalFrame) {
                for (const selector of passwordSelectors) {
                  try {
                    const element = await finalFrame.$(selector);
                    if (element && await element.isVisible()) {
                      passwordField = element;
                      this.log(`✅ Found password field after security questions: ${selector}`);
                      break;
                    }
                  } catch { continue; }
                }
              }
            }
          }
        }
      }
      throw new Error('Password field not found');
    }
    
    // Type password
    await passwordField.fill(this.credentials.password);
    this.log('✅ Password entered');
    
    // Click submit button
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
          this.log(`🔘 Clicking submit: ${selector}`);
          await element.click();
          this.log('✅ Submit clicked');
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
      // Multiple selectors for security question fields
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
            this.log(`🔒 Found security field: ${selector}`);
            break;
          }
        } catch { continue; }
      }
      
      // Also check page content for security question text
      const frameContent = await frame.content();
      const hasSecurityText = frameContent.toLowerCase().includes('pregunta') && 
                              frameContent.toLowerCase().includes('seguridad');
      
      if (!securityField && !hasSecurityText) {
        this.log('ℹ️  No security questions detected');
        return false;
      }

      // Security question found - handle it
      this.log('🔒 Security question detected, handling...');
      
      const answered = await this.securityHandler.handleSecurityQuestions(frame);
      
      if (answered) {
        this.log('✅ Security question answered successfully');
        return true;
      } else {
        this.log('⚠️ Could not answer security question, continuing anyway');
        return false;
      }

    } catch (error) {
      this.log(`⚠️  Security question handling error: ${error}`);
      // Continue without failing completely
      return false;
    }
  }


  /**
   * Verify if login was successful using Banesco-specific indicators
   */
  protected async verifyLoginSuccess(): Promise<boolean> {
    if (!this.page) return false;

    try {
      this.log('🔍 Verifying login success...');
      
      // Wait longer for page to fully load after final submit
      await this.page.waitForTimeout(5000);
      
      const currentUrl = this.page.url();
      this.log(`📍 Current URL: ${currentUrl}`);
      
      // Check for successful login indicators in URL
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
      
      // Check if URL indicates success
      const urlBasedSuccess = successUrlPatterns.some(pattern => 
        urlLower.includes(pattern.toLowerCase())
      );
      
      // But also check if we're NOT still on a login page
      const stillOnLogin = failurePatterns.some(pattern =>
        urlLower.includes(pattern.toLowerCase())
      );
      
      if (urlBasedSuccess && !stillOnLogin) {
        this.log('✅ Login verification successful by URL pattern');
        return true;
      }
      
      // Check page content for authenticated indicators
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
            this.log(`✅ Login verified by content indicator: "${indicator}"`);
            return true;
          }
        }
      } catch (e) {
        // Continue with other checks
      }
      
      // Check for system availability iframe (Banesco-specific)
      try {
        const systemIframe = await this.page.$('#ctl00_cp_frmCAU');
        if (systemIframe) {
          const systemFrame = await systemIframe.contentFrame();
          if (systemFrame) {
            const systemStatus = await systemFrame.$('.StatusSystemOK, .available');
            if (systemStatus) {
              this.log('✅ Login verified by system status iframe');
              return true;
            }
          }
        }
      } catch (e) {
        // Continue with other checks
      }
      
      // If URL changed from login page, consider it a success
      if (!stillOnLogin) {
        this.log('✅ Login appears successful - no longer on login page');
        return true;
      }
      
      this.log('❌ Login verification failed - still appears to be on login page');
      this.log(`   URL: ${currentUrl}`);
      return false;
      
    } catch (error) {
      this.log(`❌ Error during login verification: ${error}`);
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
    return { username: this.credentials.username };
  }
} 