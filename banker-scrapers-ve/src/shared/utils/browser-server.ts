import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserConfig } from '../types/index.js';

export class PersistentBrowserServer {
  private static instance: PersistentBrowserServer | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: BrowserConfig;
  private lastUsed: number = Date.now();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private requestLogger: Map<string, number> = new Map();
  
  private constructor(config?: Partial<BrowserConfig>) {
    this.config = {
      headless: false,
      locale: 'es-VE',
      timezoneId: 'America/Caracas',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      ...config
    };
    
    // Auto-cleanup después de 10 minutos de inactividad
    this.startCleanupTimer();
  }

  static getInstance(config?: Partial<BrowserConfig>): PersistentBrowserServer {
    if (!PersistentBrowserServer.instance) {
      PersistentBrowserServer.instance = new PersistentBrowserServer(config);
    }
    return PersistentBrowserServer.instance;
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const inactiveTime = Date.now() - this.lastUsed;
      const maxInactiveTime = 10 * 60 * 1000; // 10 minutos
      
      if (inactiveTime > maxInactiveTime && this.browser) {
        console.log('🕒 Navegador inactivo por 10 minutos, cerrando para liberar recursos...');
        this.close();
      }
    }, 60000); // Verificar cada minuto
  }

  private async setupAdvancedResourceBlocking(context: BrowserContext): Promise<void> {
    console.log('⚡ Configurando bloqueo avanzado de recursos...');
    
    // Counter for tracking
    let blockedResources = 0;
    let allowedResources = 0;
    
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      const method = route.request().method();
      
      // Log for analysis
      const domain = new URL(url).hostname;
      this.requestLogger.set(domain, (this.requestLogger.get(domain) || 0) + 1);
      
      // Bloquear completamente
      const shouldBlock = 
        // Analytics y tracking
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('gtag') ||
        url.includes('facebook') ||
        url.includes('twitter') ||
        url.includes('analytics') ||
        url.includes('tracking') ||
        url.includes('mixpanel') ||
        url.includes('segment') ||
        url.includes('amplitude') ||
        
        // CDNs de contenido no crítico
        url.includes('cdnjs') ||
        url.includes('jsdelivr') ||
        url.includes('unpkg') ||
        
        // Fuentes externas
        url.includes('fonts.googleapis') ||
        url.includes('fonts.gstatic') ||
        
        // Imágenes no críticas (excepto logos y iconos del banco)
        (resourceType === 'image' && 
         !url.includes('banesco') && 
         !url.includes('logo') && 
         !url.includes('icon') &&
         !url.includes('favicon')) ||
        
        // CSS no críticos
        (resourceType === 'stylesheet' && 
         (url.includes('bootstrap') || 
          url.includes('jquery-ui') || 
          url.includes('fontawesome') ||
          url.includes('material-icons'))) ||
        
        // Scripts no críticos
        (resourceType === 'script' && 
         (url.includes('jquery.min.js') && !url.includes('banesco')) ||
         url.includes('bootstrap.min.js') ||
         url.includes('popper') ||
         url.includes('moment.js')) ||
        
        // Media files
        resourceType === 'media' ||
        resourceType === 'font' ||
        
        // Documentos y archivos
        url.includes('.pdf') ||
        url.includes('.doc') ||
        url.includes('.xls') ||
        
        // Non-bank third-party requests
        (!url.includes('banesconline.com') && 
         !url.includes('banesco.com') &&
         (resourceType === 'script' || resourceType === 'stylesheet'));

      if (shouldBlock) {
        blockedResources++;
        route.abort();
        return;
      }
      
      allowedResources++;
      route.continue();
    });
    
    // Log final de optimización
    console.log(`🚀 Bloqueo configurado. Recursos permitidos: ${allowedResources}, Bloqueados: ${blockedResources}`);
  }

  async start(): Promise<void> {
    if (this.browser && this.context) {
      console.log('⚡ Reutilizando navegador persistente (inicio instantáneo)');
      this.lastUsed = Date.now();
      return;
    }

    console.log('🚀 Iniciando navegador persistente optimizado...');
    
    const launchOptions = {
      headless: this.config.headless,
      args: [
        // Optimizaciones básicas
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        
        // Rendering optimizations
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--disable-software-rasterizer',
        
        // Network optimizations
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-features=VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        
        // Desactivar funciones no necesarias
        '--disable-extensions',
        '--disable-plugins',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-background-mode',
        
        // Memory optimizations
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--js-flags="--max-old-space-size=4096"',
        
        // Additional network optimizations
        '--aggressive-cache-discard',
        '--disable-background-networking',
        '--disable-features=AudioServiceOutOfProcess',
        
        // Performance
        '--enable-fast-unload',
        '--disable-features=UserMediaScreenCapturing',
        '--disable-blink-features=AutomationControlled'
      ]
    };

    this.browser = await chromium.launch(launchOptions);
    
    const contextOptions = {
      locale: this.config.locale,
      timezoneId: this.config.timezoneId,
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      reducedMotion: 'reduce' as const,
      permissions: [],
      // Configuraciones adicionales de performance
      httpCredentials: undefined,
      storageState: undefined,
      acceptDownloads: false,
      colorScheme: 'light' as const,
      forcedColors: 'none' as const,
      recordVideo: undefined,
      recordHar: undefined
    };

    this.context = await this.browser.newContext(contextOptions);
    
    // Configurar bloqueo avanzado
    await this.setupAdvancedResourceBlocking(this.context);
    
    this.lastUsed = Date.now();
    console.log('✅ Navegador persistente iniciado y optimizado');
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      await this.start();
    }
    
    this.lastUsed = Date.now();
    console.log('📄 Creando nueva página optimizada...');
    
    const page = await this.context!.newPage();
    
    // Headers optimizados
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1', // Do Not Track
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Timeouts optimizados
    page.setDefaultTimeout(12000); // 12 segundos
    page.setDefaultNavigationTimeout(18000); // 18 segundos
    
    // Deshabilitar imágenes por defecto (se pueden habilitar selectivamente)
    await page.addInitScript(() => {
      // Optimizar carga de scripts
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    return page;
  }

  async close(): Promise<void> {
    console.log('🔴 Cerrando navegador persistente...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    // Reset singleton
    PersistentBrowserServer.instance = null;
  }

  // Analysis methods
  getRequestStats(): { domain: string; requests: number }[] {
    return Array.from(this.requestLogger.entries())
      .map(([domain, requests]) => ({ domain, requests }))
      .sort((a, b) => b.requests - a.requests);
  }

  printRequestAnalysis(): void {
    console.log('\n📊 ANÁLISIS DE REQUESTS DE RED:');
    console.log('================================');
    
    const stats = this.getRequestStats();
    const total = stats.reduce((sum, stat) => sum + stat.requests, 0);
    
    console.log(`📈 Total de requests: ${total}`);
    console.log(`🌐 Dominios únicos: ${stats.length}`);
    console.log('\n🔝 Top 10 dominios más solicitados:');
    
    stats.slice(0, 10).forEach((stat, index) => {
      const percentage = ((stat.requests / total) * 100).toFixed(1);
      console.log(`   ${index + 1}. ${stat.domain}: ${stat.requests} requests (${percentage}%)`);
    });
    
    console.log('\n💡 Dominios candidatos para bloqueo:');
    stats
      .filter(stat => 
        !stat.domain.includes('banesco') && 
        !stat.domain.includes('localhost') &&
        stat.requests > 5
      )
      .slice(0, 5)
      .forEach(stat => {
        console.log(`   🚫 ${stat.domain}: ${stat.requests} requests`);
      });
  }

  // Server status
  getStatus(): {
    isActive: boolean;
    lastUsed: Date;
    uptime: number;
    requestStats: { domain: string; requests: number }[];
  } {
    return {
      isActive: this.browser !== null && this.context !== null,
      lastUsed: new Date(this.lastUsed),
      uptime: Date.now() - this.lastUsed,
      requestStats: this.getRequestStats()
    };
  }

  // Restart browser to free memory
  async restart(): Promise<void> {
    console.log('🔄 Reiniciando navegador persistente...');
    await this.close();
    await this.start();
  }
} 