/**
 * Session Manager
 * 
 * Manages browser session persistence for faster subsequent logins.
 * 
 * SECURITY WARNING: Session persistence is DISABLED by default.
 * 
 * Session data includes sensitive information (cookies, localStorage, sessionStorage)
 * that could be used to access your bank account. Only enable persistence in
 * development environments with appropriate security measures.
 * 
 * For production use, consider:
 * - Implementing your own SessionStorageProvider with encryption
 * - Using a secure secrets manager
 * - Setting appropriate file permissions
 */

import { Page } from 'playwright';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createLogger, truncateForLog, type LogLevel, type Logger } from './logger.js';

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
  timestamp: number;
  userAgent: string;
  username: string;
}

/**
 * Interface for custom session storage providers
 * 
 * Implement this interface to store sessions securely (e.g., encrypted, in a secrets manager)
 */
export interface SessionStorageProvider {
  /** Save session data */
  save(sessionId: string, data: SessionData): Promise<void>;
  /** Load session data (returns null if not found or expired) */
  load(sessionId: string): Promise<SessionData | null>;
  /** Delete a session */
  delete(sessionId: string): Promise<void>;
  /** Delete all sessions */
  deleteAll(): Promise<void>;
}

export interface SessionManagerConfig {
  /** Enable session persistence (default: false for security) */
  enabled?: boolean;
  /** Session expiry in hours (default: 24) */
  expiryHours?: number;
  /** Custom storage provider (if not provided, uses local file storage - DEV ONLY) */
  storageProvider?: SessionStorageProvider;
  /** Directory for file-based storage (default: .sessions in cwd) */
  sessionsDir?: string;
  /** Log level */
  logLevel?: LogLevel;
}

/**
 * Default file-based storage provider (DEV ONLY)
 * 
 * WARNING: This stores session data in plaintext JSON files.
 * Only use for development. For production, implement your own
 * SessionStorageProvider with encryption.
 */
class FileStorageProvider implements SessionStorageProvider {
  private sessionsDir: string;
  private expiryMs: number;
  private logger: Logger;

  constructor(sessionsDir: string, expiryHours: number, logger: Logger) {
    this.sessionsDir = sessionsDir;
    this.expiryMs = expiryHours * 60 * 60 * 1000;
    this.logger = logger;
    this.ensureDir();
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.access(this.sessionsDir);
    } catch {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    }
  }

  private getPath(sessionId: string): string {
    const safeId = this.hashId(sessionId);
    return join(this.sessionsDir, `session_${safeId}.json`);
  }

  private hashId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async save(sessionId: string, data: SessionData): Promise<void> {
    await this.ensureDir();
    const path = this.getPath(sessionId);
    await fs.writeFile(path, JSON.stringify(data, null, 2));
    this.logger.debug(`Session saved: ${path}`);
  }

  async load(sessionId: string): Promise<SessionData | null> {
    const path = this.getPath(sessionId);
    
    try {
      await fs.access(path);
    } catch {
      return null;
    }

    try {
      const raw = await fs.readFile(path, 'utf-8');
      const data: SessionData = JSON.parse(raw);

      // Check expiry
      const age = Date.now() - data.timestamp;
      if (age > this.expiryMs) {
        this.logger.debug('Session expired, deleting...');
        await this.delete(sessionId);
        return null;
      }

      return data;
    } catch (e) {
      this.logger.warn(`Failed to load session: ${e}`);
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const path = this.getPath(sessionId);
    try {
      await fs.unlink(path);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  async deleteAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));
      
      for (const file of sessionFiles) {
        await fs.unlink(join(this.sessionsDir, file));
      }
      
      this.logger.debug(`Deleted ${sessionFiles.length} sessions`);
    } catch (e) {
      this.logger.warn(`Error clearing sessions: ${e}`);
    }
  }
}

export class SessionManager {
  private static instance: SessionManager | null = null;
  private logger: Logger;
  private config: Required<SessionManagerConfig>;
  private storageProvider: SessionStorageProvider | null = null;

  private constructor(config: SessionManagerConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false, // OFF by default for security
      expiryHours: config.expiryHours ?? 24,
      storageProvider: config.storageProvider as any,
      sessionsDir: config.sessionsDir ?? join(process.cwd(), '.sessions'),
      logLevel: config.logLevel ?? 'warn'
    };
    
    this.logger = createLogger('SessionManager', { level: this.config.logLevel });
    
    if (this.config.enabled) {
      if (this.config.storageProvider) {
        this.storageProvider = this.config.storageProvider;
        this.logger.info('Session persistence enabled with custom provider');
      } else {
        // Warn about using file storage
        this.logger.warn('Session persistence enabled with FILE STORAGE (DEV ONLY)');
        this.logger.warn('For production, implement a secure SessionStorageProvider');
        this.storageProvider = new FileStorageProvider(
          this.config.sessionsDir,
          this.config.expiryHours,
          this.logger
        );
      }
    } else {
      this.logger.debug('Session persistence is disabled (default)');
    }
  }

  static getInstance(config?: SessionManagerConfig): SessionManager {
    if (!SessionManager.instance || config) {
      SessionManager.instance = new SessionManager(config);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    SessionManager.instance = null;
  }

  /**
   * Check if session persistence is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.storageProvider !== null;
  }

  /**
   * Save browser session for a user
   */
  async saveSession(page: Page, username: string): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.debug('Session persistence disabled, skipping save');
      return false;
    }
    
    try {
      this.logger.debug(`Saving session for user: ${truncateForLog(username, 3)}`);

      const context = page.context();
      const cookies = await context.cookies();

      const storageData = await page.evaluate(() => {
        const localStorage: Record<string, string> = {};
        const sessionStorage: Record<string, string> = {};

        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            localStorage[key] = window.localStorage.getItem(key) || '';
          }
        }

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
        username: truncateForLog(username, 3) // Only store truncated username
      };

      await this.storageProvider!.save(username, sessionData);

      this.logger.info('Session saved successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to save session', error);
      return false;
    }
  }

  /**
   * Restore browser session for a user
   */
  async restoreSession(page: Page, username: string): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.debug('Session persistence disabled, skipping restore');
      return false;
    }
    
    try {
      const sessionData = await this.storageProvider!.load(username);
      
      if (!sessionData) {
        this.logger.debug('No existing session found');
        return false;
      }

      const ageMinutes = Math.round((Date.now() - sessionData.timestamp) / (60 * 1000));
      this.logger.debug(`Restoring session (age: ${ageMinutes} minutes)`);

      const context = page.context();
      await context.addCookies(sessionData.cookies);

      await page.goto(sessionData.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });

      await page.evaluate((data) => {
        Object.entries(data.localStorage).forEach(([key, value]) => {
          try {
            window.localStorage.setItem(key, value);
          } catch (e) {
            // Silently fail
          }
        });

        Object.entries(data.sessionStorage).forEach(([key, value]) => {
          try {
            window.sessionStorage.setItem(key, value);
          } catch (e) {
            // Silently fail
          }
        });
      }, sessionData);

      await page.reload({ waitUntil: 'domcontentloaded' });

      this.logger.info('Session restored successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to restore session', error);
      return false;
    }
  }

  /**
   * Validate if a session is still valid
   */
  async isSessionValid(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      const content = await page.content();
      
      const isInBankingArea = content.includes('Banesco') && 
                              !content.includes('Login') && 
                              !content.includes('txtUsuario') &&
                              (url.includes('index.aspx') || url.includes('default.aspx'));

      if (isInBankingArea) {
        this.logger.debug('Session valid: Banking area detected');
        return true;
      } else {
        this.logger.debug('Session invalid: Not in banking area');
        return false;
      }

    } catch (error) {
      this.logger.warn('Session validation failed', error);
      return false;
    }
  }

  /**
   * Clear session for a user
   */
  async clearSession(username: string): Promise<void> {
    if (!this.isEnabled()) return;
    
    try {
      await this.storageProvider!.delete(username);
      this.logger.debug(`Session cleared for user: ${truncateForLog(username, 3)}`);
    } catch (error) {
      this.logger.debug('No session to clear');
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    if (!this.isEnabled()) return;
    
    await this.storageProvider!.deleteAll();
    this.logger.info('All sessions cleared');
  }
}
