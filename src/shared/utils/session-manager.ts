import { Page, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import { join } from 'path';
import { StrategicLogger } from './strategic-logger.js';

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
  timestamp: number;
  userAgent: string;
  username: string;
}

export class SessionManager {
  private static instance: SessionManager;
  private logger = StrategicLogger.getInstance().createComponentLogger('SessionManager');
  private sessionsDir = join(process.cwd(), '.sessions');

  private constructor() {
    this.ensureSessionsDir();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.access(this.sessionsDir);
    } catch {
      await fs.mkdir(this.sessionsDir, { recursive: true });
      this.logger.info('Sessions directory created', { path: this.sessionsDir });
    }
  }

  private getSessionPath(username: string): string {
    const sessionId = this.hashUsername(username);
    return join(this.sessionsDir, `session_${sessionId}.json`);
  }

  private hashUsername(username: string): string {
    // Simple hash para crear ID único pero no reversible
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      const char = username.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  async saveSession(page: Page, username: string): Promise<boolean> {
    const operationId = this.logger.startOperation('save_session');
    
    try {
      this.logger.info('Saving browser session', { username: username.substring(0, 3) + '***' });

      // Obtener cookies
      const context = page.context();
      const cookies = await context.cookies();

      // Obtener localStorage y sessionStorage
      const storageData = await page.evaluate(() => {
        const localStorage: Record<string, string> = {};
        const sessionStorage: Record<string, string> = {};

        // Capturar localStorage
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            localStorage[key] = window.localStorage.getItem(key) || '';
          }
        }

        // Capturar sessionStorage
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) {
            sessionStorage[key] = window.sessionStorage.getItem(key) || '';
          }
        }

        return { localStorage, sessionStorage };
      });

      const sessionData: SessionData = {
        cookies,
        localStorage: storageData.localStorage,
        sessionStorage: storageData.sessionStorage,
        url: page.url(),
        timestamp: Date.now(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        username: username.substring(0, 3) + '***' // Solo primeros 3 caracteres por seguridad
      };

      const sessionPath = this.getSessionPath(username);
      await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));

      this.logger.success('Session saved successfully', { 
        path: sessionPath,
        cookiesCount: cookies.length,
        localStorageKeys: Object.keys(storageData.localStorage).length
      });
      
      this.logger.endOperation(operationId);
      return true;

    } catch (error) {
      this.logger.error('Failed to save session', error);
      this.logger.endOperation(operationId);
      return false;
    }
  }

  async restoreSession(page: Page, username: string): Promise<boolean> {
    const operationId = this.logger.startOperation('restore_session');
    
    try {
      const sessionPath = this.getSessionPath(username);
      
      // Verificar si existe el archivo de sesión
      try {
        await fs.access(sessionPath);
      } catch {
        this.logger.info('No existing session found');
        this.logger.endOperation(operationId);
        return false;
      }

      const sessionDataRaw = await fs.readFile(sessionPath, 'utf-8');
      const sessionData: SessionData = JSON.parse(sessionDataRaw);

      // Verificar si la sesión no es muy antigua (24 horas)
      const sessionAge = Date.now() - sessionData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas
      
      if (sessionAge > maxAge) {
        this.logger.warn('Session expired, removing old session file', { 
          ageHours: Math.round(sessionAge / (60 * 60 * 1000)) 
        });
        await fs.unlink(sessionPath);
        this.logger.endOperation(operationId);
        return false;
      }

      this.logger.info('Restoring browser session', { 
        username: username.substring(0, 3) + '***',
        ageMinutes: Math.round(sessionAge / (60 * 1000)),
        cookiesCount: sessionData.cookies.length
      });

      // Restaurar cookies
      const context = page.context();
      await context.addCookies(sessionData.cookies);

      // Navegar a la URL guardada
      await page.goto(sessionData.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });

      // Restaurar localStorage y sessionStorage
      await page.evaluate((data) => {
        // Restaurar localStorage
        Object.entries(data.localStorage).forEach(([key, value]) => {
          try {
            window.localStorage.setItem(key, value);
          } catch (e) {
            console.warn('Failed to set localStorage item:', key);
          }
        });

        // Restaurar sessionStorage
        Object.entries(data.sessionStorage).forEach(([key, value]) => {
          try {
            window.sessionStorage.setItem(key, value);
          } catch (e) {
            console.warn('Failed to set sessionStorage item:', key);
          }
        });
      }, sessionData);

      // Recargar la página para aplicar los cambios
      await page.reload({ waitUntil: 'domcontentloaded' });

      this.logger.success('Session restored successfully');
      this.logger.endOperation(operationId);
      return true;

    } catch (error) {
      this.logger.error('Failed to restore session', error);
      this.logger.endOperation(operationId);
      return false;
    }
  }

  async isSessionValid(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      const content = await page.content();
      
      // Verificar si estamos en área bancaria (no en login)
      const isInBankingArea = content.includes('Banesco') && 
                              !content.includes('Login') && 
                              !content.includes('txtUsuario') &&
                              (url.includes('index.aspx') || url.includes('default.aspx'));

      if (isInBankingArea) {
        this.logger.info('Session validation: VALID - Banking area detected');
        return true;
      } else {
        this.logger.info('Session validation: INVALID - Not in banking area', { url });
        return false;
      }

    } catch (error) {
      this.logger.warn('Session validation failed', error);
      return false;
    }
  }

  async clearSession(username: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(username);
      await fs.unlink(sessionPath);
      this.logger.info('Session cleared', { username: username.substring(0, 3) + '***' });
    } catch (error) {
      // Session file doesn't exist, that's fine
      this.logger.trace('No session to clear');
    }
  }

  async clearAllSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter(file => file.startsWith('session_') && file.endsWith('.json'));
      
      for (const file of sessionFiles) {
        await fs.unlink(join(this.sessionsDir, file));
      }
      
      this.logger.info('All sessions cleared', { count: sessionFiles.length });
    } catch (error) {
      this.logger.warn('Error clearing sessions', error);
    }
  }

  async listSessions(): Promise<Array<{ username: string; timestamp: number; ageHours: number }>> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter(file => file.startsWith('session_') && file.endsWith('.json'));
      
      const sessions = [];
      
      for (const file of sessionFiles) {
        try {
          const filePath = join(this.sessionsDir, file);
          const sessionDataRaw = await fs.readFile(filePath, 'utf-8');
          const sessionData: SessionData = JSON.parse(sessionDataRaw);
          
          sessions.push({
            username: sessionData.username,
            timestamp: sessionData.timestamp,
            ageHours: Math.round((Date.now() - sessionData.timestamp) / (60 * 60 * 1000))
          });
        } catch (e) {
          // Skip invalid session files
        }
      }
      
      return sessions;
    } catch (error) {
      this.logger.warn('Error listing sessions', error);
      return [];
    }
  }
} 