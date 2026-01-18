import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserConfig } from '../types/index.js';

export class BrowserManager {
  private static sharedBrowser: Browser | null = null;
  private static sharedContext: BrowserContext | null = null;
  private static instanceCount = 0;
  
  private config: BrowserConfig;

  constructor(config?: Partial<BrowserConfig>) {
    this.config = {
      headless: false,
      locale: 'es-VE',
      timezoneId: 'America/Caracas',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      ...config
    };
    
    BrowserManager.instanceCount++;
  }

  private async setupResourceBlocking(context: BrowserContext): Promise<void> {
    console.log('⚡ Configurando bloqueo de recursos para mayor velocidad...');
    
    // Bloquear recursos innecesarios
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      
      // Bloquear imágenes (excepto algunas críticas)
      if (resourceType === 'image') {
        if (!url.includes('logo') && !url.includes('icon')) {
          route.abort();
          return;
        }
      }
      
      // Bloquear fuentes
      if (resourceType === 'font') {
        route.abort();
        return;
      }
      
      // Bloquear algunos CSS no críticos
      if (resourceType === 'stylesheet') {
        if (url.includes('bootstrap') || url.includes('jquery-ui') || url.includes('theme')) {
          route.abort();
          return;
        }
      }
      
      // Bloquear analytics y tracking
      if (url.includes('google-analytics') || 
          url.includes('gtag') || 
          url.includes('facebook') ||
          url.includes('twitter') ||
          url.includes('analytics') ||
          url.includes('tracking')) {
        route.abort();
        return;
      }
      
      // Continue with the request
      route.continue();
    });
  }

  async launch(): Promise<void> {
    if (BrowserManager.sharedBrowser && BrowserManager.sharedContext) {
      console.log('⚡ Reutilizando navegador ya iniciado (optimización de velocidad)');
      return;
    }

    console.log('🚀 Iniciando navegador optimizado...');
    
    // Configuration optimized for speed
    const launchOptions = {
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ]
    };

    BrowserManager.sharedBrowser = await chromium.launch(launchOptions);
    
    const contextOptions = {
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      // Optimizaciones adicionales
      reducedMotion: 'reduce' as const,
      // Deshabilitar notificaciones y permisos innecesarios
      permissions: [],
    };

    BrowserManager.sharedContext = await BrowserManager.sharedBrowser.newContext(contextOptions);
    
    // Configurar bloqueo de recursos
    await this.setupResourceBlocking(BrowserManager.sharedContext);
    
    console.log('✅ Navegador optimizado iniciado y listo');
  }

  async newPage(): Promise<Page> {
    if (!BrowserManager.sharedContext) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    
    console.log('📄 Creando nueva página optimizada...');
    const page = await BrowserManager.sharedContext.newPage();
    
    // Configuraciones adicionales por página
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
    
    // Timeout más agresivo para mayor velocidad
    page.setDefaultTimeout(15000); // 15 segundos en lugar de 30
    page.setDefaultNavigationTimeout(20000); // 20 segundos
    
    return page;
  }

  async close(): Promise<void> {
    BrowserManager.instanceCount--;
    
    // Solo cerrar el navegador cuando no hay más instancias
    if (BrowserManager.instanceCount <= 0) {
      console.log('🧹 Cerrando navegador compartido...');
      
      if (BrowserManager.sharedContext) {
        await BrowserManager.sharedContext.close();
        BrowserManager.sharedContext = null;
      }
      
      if (BrowserManager.sharedBrowser) {
        await BrowserManager.sharedBrowser.close();
        BrowserManager.sharedBrowser = null;
      }
      
      BrowserManager.instanceCount = 0;
    } else {
      console.log(`⚡ Manteniendo navegador abierto (${BrowserManager.instanceCount} instancias activas)`);
    }
  }

  getBrowser(): Browser | null {
    return BrowserManager.sharedBrowser;
  }

  getContext(): BrowserContext | null {
    return BrowserManager.sharedContext;
  }

  // Método estático para forzar el cierre del navegador
  static async forceClose(): Promise<void> {
    console.log('🔴 Forzando cierre del navegador...');
    
    if (BrowserManager.sharedContext) {
      await BrowserManager.sharedContext.close();
      BrowserManager.sharedContext = null;
    }
    
    if (BrowserManager.sharedBrowser) {
      await BrowserManager.sharedBrowser.close();
      BrowserManager.sharedBrowser = null;
    }
    
    BrowserManager.instanceCount = 0;
  }

  // Method to check if the browser is active
  static isActive(): boolean {
    return BrowserManager.sharedBrowser !== null && BrowserManager.sharedContext !== null;
  }

  // Method to get statistics
  static getStats(): { browserActive: boolean; instanceCount: number } {
    return {
      browserActive: BrowserManager.isActive(),
      instanceCount: BrowserManager.instanceCount
    };
  }
} 