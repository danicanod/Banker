import { Page, Frame } from 'playwright';
import { BanescCredentials, LoginResult } from '../types/index.js';
import { PersistentBrowserServer } from '../../../shared/utils/browser-server.js';
import { SecurityQuestionsHandler } from './security-questions.js';
import { StrategicLogger } from '../../../shared/utils/strategic-logger.js';
import { SessionManager } from '../../../shared/utils/session-manager.js';
import { SmartWaiter } from '../../../shared/utils/smart-waiter.js';

export class OptimizedLogin {
  private browserServer: PersistentBrowserServer;
  private securityHandler: SecurityQuestionsHandler;
  private credentials: BanescCredentials;
  private authenticatedPage: Page | null = null;
  private isLoggedIn: boolean = false;
  private logger = StrategicLogger.getInstance().createComponentLogger('OptimizedLogin');
  private sessionManager = SessionManager.getInstance();

  constructor(credentials: BanescCredentials, headless: boolean = false) {
    this.credentials = credentials;
    this.browserServer = PersistentBrowserServer.getInstance({ headless });
    this.securityHandler = new SecurityQuestionsHandler(credentials.securityQuestions);
    
    this.logger.info('OptimizedLogin initialized', { 
      username: credentials.username.substring(0, 3) + '***',
      headless 
    });
  }

  async login(): Promise<LoginResult> {
    const loginOperationId = this.logger.startOperation('optimized_login');
    
    try {
      this.logger.info('🚀 Starting optimized login process');

      // FASE 1: Intentar restaurar sesión con cookies (evita preguntas de seguridad)
      const sessionRestored = await this.trySessionRestore();
      if (sessionRestored) {
        this.logger.success('✨ Session restored - login instantáneo!');
        this.logger.endOperation(loginOperationId);
        return {
          success: true,
          message: 'Login exitoso: Sesión restaurada (sin preguntas de seguridad)',
          sessionValid: true
        };
      }

      // FASE 2: Login fresh con manejo inteligente de cookies
      await this.browserServer.start();
      const page = await this.browserServer.newPage();

      // Configurar contexto para mantener cookies como navegador normal
      await this.setupBrowserContext(page);

      const loginSuccess = await this.performOptimizedLogin(page);
      
      if (loginSuccess) {
        // Guardar sesión completa para evitar preguntas futuras
        await this.sessionManager.saveSession(page, this.credentials.username);
        
        this.authenticatedPage = page;
        this.isLoggedIn = true;

        this.logger.success('🎉 Login optimizado completado exitosamente');
        this.logger.endOperation(loginOperationId);
        
        return {
          success: true,
          message: 'Login exitoso con sistema optimizado',
          sessionValid: true
        };
      } else {
        this.logger.endOperation(loginOperationId);
        return {
          success: false,
          message: 'Login falló en proceso de autenticación',
          sessionValid: false
        };
      }

    } catch (error: any) {
      this.logger.error('Error in optimized login', error);
      this.logger.endOperation(loginOperationId);
      return {
        success: false,
        message: `Error durante login: ${error.message || error}`,
        sessionValid: false
      };
    }
  }

  private async trySessionRestore(): Promise<boolean> {
    const operationId = this.logger.startOperation('session_restore');
    
    try {
      this.logger.info('🔄 Intentando restaurar sesión existente');

      await this.browserServer.start();
      const page = await this.browserServer.newPage();

      const restored = await this.sessionManager.restoreSession(page, this.credentials.username);
      
      if (restored) {
        const isValid = await this.sessionManager.isSessionValid(page);
        
        if (isValid) {
          this.authenticatedPage = page;
          this.isLoggedIn = true;
          this.logger.success('Sesión restaurada y validada - evitando preguntas de seguridad');
          this.logger.endOperation(operationId);
          return true;
        } else {
          this.logger.info('Sesión inválida, procediendo con login fresh');
          await this.sessionManager.clearSession(this.credentials.username);
        }
      }

      this.logger.endOperation(operationId);
      return false;

    } catch (error) {
      this.logger.warn('Fallo en restauración de sesión', error);
      this.logger.endOperation(operationId);
      return false;
    }
  }

  private async setupBrowserContext(page: Page): Promise<void> {
    // Configurar headers y contexto como navegador normal para maximizar cookies
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });

    // Configurar viewport estándar
    await page.setViewportSize({ width: 1366, height: 768 });
  }

  private async performOptimizedLogin(page: Page): Promise<boolean> {
    const operationId = this.logger.startOperation('login_process');
    
    try {
      this.logger.info('🔐 Iniciando proceso de login optimizado');

      // Navegación inicial
      await page.goto('https://www.banesconline.com/mantis/Website/Login.aspx', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      // Acceso al iframe
      const frame = await SmartWaiter.waitForIframeReady(page, 'iframe#ctl00_cp_frmAplicacion', {
        timeout: 10000,
        description: 'login_iframe'
      });

      // PASO 1: Username
      await this.enterUsername(frame);

      // PASO 2: Manejo de modales (si aparecen)
      const modalHandled = await this.handleConnectionModal(frame);

      // PASO 3: Verificar si aparecen preguntas de seguridad
      const needsSecurityQuestions = await this.checkForSecurityQuestions(frame);
      
      if (needsSecurityQuestions) {
        this.logger.info('🛡️ Preguntas de seguridad detectadas');
        const securityHandled = await this.handleSecurityQuestions(frame);
        if (!securityHandled) {
          this.logger.warn('Fallo en manejo de preguntas de seguridad');
          return false;
        }
      } else {
        this.logger.info('✅ Sin preguntas de seguridad - usando cookies existentes');
        // Si no hay preguntas de seguridad, proceder con password
        await this.enterPassword(frame);
      }

      // PASO 4: Verificación final
      const success = await this.verifyLoginSuccess(page);

      this.logger.endOperation(operationId);
      return success;

    } catch (error) {
      this.logger.error('Login process failed', error);
      this.logger.endOperation(operationId);
      return false;
    }
  }

  private async enterUsername(frame: Frame): Promise<void> {
    this.logger.info('👤 Ingresando usuario');

    const usernameInput = await SmartWaiter.waitForElementReady(frame, 'input[name="txtUsuario"]', {
      timeout: 8000,
      description: 'username_input'
    });
    
    await usernameInput.fill(this.credentials.username);
    
    const submitButton = await SmartWaiter.waitForElementReady(frame, 'input[name="bAceptar"]', {
      timeout: 5000,
      description: 'username_submit'
    });
    
    await submitButton.click();
    await SmartWaiter.waitForDOMReady(frame, { timeout: 8000, description: 'post_username' });
  }

  private async handleConnectionModal(frame: Frame): Promise<boolean> {
    this.logger.info('📱 Verificando modales de conexión');

    try {
      const modal = await frame.waitForSelector('.swal2-container .swal2-modal', { 
        timeout: 3000,
        state: 'visible' 
      });
      
      if (modal) {
        const modalText = await modal.textContent() || '';
        
        if (modalText.includes('conexión activa')) {
          this.logger.info('Modal de conexión activa detectado');
          
          const acceptButton = await frame.waitForSelector('button:has-text("Aceptar"), .swal2-confirm', {
            timeout: 3000
          });
          
          if (acceptButton) {
            await acceptButton.click();
            this.logger.success('Modal manejado exitosamente');
            
            // Re-enviar username después del modal
            await SmartWaiter.smartDelay(500);
            
            const userField = await frame.$('input[name="txtUsuario"]');
            if (userField) {
              const userValue = await userField.inputValue();
              if (!userValue) {
                await userField.fill(this.credentials.username);
                const retrySubmit = await frame.$('input[name="bAceptar"]');
                if (retrySubmit) {
                  await retrySubmit.click();
                  await SmartWaiter.waitForDOMReady(frame, { timeout: 8000 });
                }
              }
            }
            return true;
          }
        }
      }
    } catch (e) {
      this.logger.trace('No hay modales detectados');
    }
    return false;
  }

  private async checkForSecurityQuestions(frame: Frame): Promise<boolean> {
    try {
      const firstQuestionLabel = await frame.waitForSelector('#lblPrimeraP', { 
        timeout: 5000,
        state: 'visible' 
      });
      
      return firstQuestionLabel !== null;
    } catch (e) {
      return false;
    }
  }

  private async handleSecurityQuestions(frame: Frame): Promise<boolean> {
    try {
      const handled = await this.securityHandler.handleSecurityQuestions(frame);
      
      if (handled) {
        const submitButton = await SmartWaiter.waitForElementReady(frame, 'input[name="bAceptar"]', {
          timeout: 8000,
          description: 'security_submit'
        });
        
        await submitButton.click();
        await SmartWaiter.waitForDOMReady(frame, { timeout: 10000 });
        
        this.logger.success('Preguntas de seguridad completadas');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error en preguntas de seguridad', error);
      return false;
    }
  }

  private async enterPassword(frame: Frame): Promise<void> {
    this.logger.info('🔑 Ingresando contraseña');

    const passwordSelectors = [
      'input[name="txtClave"]',
      'input[type="password"]'
    ];
    
    for (const selector of passwordSelectors) {
      try {
        const passwordInput = await frame.waitForSelector(selector, {
          timeout: 5000,
          state: 'visible'
        });
        
        if (passwordInput) {
          await passwordInput.fill(this.credentials.password);
          
          const submitButton = await SmartWaiter.waitForElementReady(frame, 'input[type="submit"], input[name="bAceptar"]', {
            timeout: 5000,
            description: 'password_submit'
          });
          
          await submitButton.click();
          this.logger.success('Contraseña ingresada');
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }

  private async verifyLoginSuccess(page: Page): Promise<boolean> {
    this.logger.info('✅ Verificando éxito del login');

    await SmartWaiter.waitForDOMReady(page, { 
      timeout: 10000,
      description: 'final_verification' 
    });
    
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    if (pageContent.includes('Banesco') && !pageContent.includes('Login') && 
        (currentUrl.includes('index.aspx') || currentUrl.includes('default.aspx'))) {
      this.logger.success('✨ Acceso al área bancaria confirmado');
      return true;
    }
    
    // Intentar navegación directa si es necesario
    const directUrls = [
      'https://www.banesconline.com/Mantis/WebSite/index.aspx',
      'https://www.banesconline.com/mantis/Website/index.aspx'
    ];
    
    for (const url of directUrls) {
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 8000
        });
        
        const newContent = await page.content();
        if (newContent.includes('Banesco') && !newContent.includes('Login')) {
          this.logger.success('✨ Acceso directo exitoso');
          return true;
        }
      } catch (e) {
        continue;
      }
    }

    return false;
  }

  async getAuthenticatedPage(): Promise<Page | null> {
    if (this.isLoggedIn && this.authenticatedPage) {
      return this.authenticatedPage;
    }
    
    const loginResult = await this.login();
    
    if (loginResult.success && this.authenticatedPage) {
      return this.authenticatedPage;
    }
    
    return null;
  }

  async close(): Promise<void> {
    this.isLoggedIn = false;
    this.authenticatedPage = null;
    await this.browserServer.close();
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn && this.authenticatedPage !== null;
  }

  async getCurrentUrl(): Promise<string | null> {
    if (this.authenticatedPage) {
      return this.authenticatedPage.url();
    }
    return null;
  }
} 