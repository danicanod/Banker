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
    console.log('[browser] setting up resource blocking');
    
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      
      // Block images (except critical ones)
      if (resourceType === 'image') {
        if (!url.includes('logo') && !url.includes('icon')) {
          route.abort();
          return;
        }
      }
      
      // Block fonts
      if (resourceType === 'font') {
        route.abort();
        return;
      }
      
      // Block non-critical CSS
      if (resourceType === 'stylesheet') {
        if (url.includes('bootstrap') || url.includes('jquery-ui') || url.includes('theme')) {
          route.abort();
          return;
        }
      }
      
      // Block analytics and tracking
      if (url.includes('google-analytics') || 
          url.includes('gtag') || 
          url.includes('facebook') ||
          url.includes('twitter') ||
          url.includes('analytics') ||
          url.includes('tracking')) {
        route.abort();
        return;
      }
      
      route.continue();
    });
  }

  async launch(): Promise<void> {
    if (BrowserManager.sharedBrowser && BrowserManager.sharedContext) {
      console.log('[browser] reusing existing instance');
      return;
    }

    console.log('[browser] launching...');
    
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
      reducedMotion: 'reduce' as const,
      permissions: [],
    };

    BrowserManager.sharedContext = await BrowserManager.sharedBrowser.newContext(contextOptions);
    await this.setupResourceBlocking(BrowserManager.sharedContext);
    
    console.log('[browser] ready');
  }

  async newPage(): Promise<Page> {
    if (!BrowserManager.sharedContext) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    
    console.log('[browser] creating page');
    const page = await BrowserManager.sharedContext.newPage();
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
    
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);
    
    return page;
  }

  async close(): Promise<void> {
    BrowserManager.instanceCount--;
    
    if (BrowserManager.instanceCount <= 0) {
      console.log('[browser] closing');
      
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
      console.log(`[browser] keeping open (${BrowserManager.instanceCount} instances)`);
    }
  }

  getBrowser(): Browser | null {
    return BrowserManager.sharedBrowser;
  }

  getContext(): BrowserContext | null {
    return BrowserManager.sharedContext;
  }

  static async forceClose(): Promise<void> {
    console.log('[browser] force closing');
    
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

  static isActive(): boolean {
    return BrowserManager.sharedBrowser !== null && BrowserManager.sharedContext !== null;
  }

  static getStats(): { browserActive: boolean; instanceCount: number } {
    return {
      browserActive: BrowserManager.isActive(),
      instanceCount: BrowserManager.instanceCount
    };
  }
}
