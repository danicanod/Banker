/**
 * HTML Saver Utility
 * 
 * Saves HTML content to disk for debugging purposes.
 * 
 * IMPORTANT: This utility is DISABLED by default.
 * HTML captures may contain sensitive data. Only enable in development.
 */

import fs from 'fs';
import path from 'path';
import { createLogger, type LogLevel, type Logger } from './logger.js';

export interface HTMLSaverConfig {
  /** Enable HTML saving (default: false) */
  enabled?: boolean;
  /** Output directory (default: html-captures in cwd) */
  outputDir?: string;
  /** Log level */
  logLevel?: LogLevel;
}

export class HTMLSaver {
  private htmlDir: string;
  private enabled: boolean;
  private logger: Logger;

  constructor(config: HTMLSaverConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.htmlDir = config.outputDir ?? path.join(process.cwd(), 'html-captures');
    this.logger = createLogger('HTMLSaver', { level: config.logLevel ?? 'warn' });
    
    if (this.enabled) {
      this.ensureDirectoryExists();
      this.logger.warn('HTML saving enabled (DEBUG MODE)');
    }
  }

  private ensureDirectoryExists(): void {
    if (!this.enabled) return;
    
    if (!fs.existsSync(this.htmlDir)) {
      fs.mkdirSync(this.htmlDir, { recursive: true });
    }
  }

  /**
   * Save page HTML to file (only if enabled)
   */
  async saveHTML(page: any, filename: string): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`HTML saving disabled, skipping: ${filename}`);
      return;
    }
    
    try {
      const content = await page.content();
      const filePath = path.join(this.htmlDir, filename);
      fs.writeFileSync(filePath, content);
      this.logger.debug(`HTML saved: ${filename}`);
    } catch (error) {
      this.logger.warn(`Failed to save HTML: ${filename}`);
    }
  }

  /**
   * Save frame HTML to file (only if enabled)
   */
  async saveFrameHTML(frame: any, filename: string): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`HTML saving disabled, skipping: ${filename}`);
      return;
    }
    
    try {
      const content = await frame.content();
      const filePath = path.join(this.htmlDir, filename);
      fs.writeFileSync(filePath, content);
      this.logger.debug(`Frame HTML saved: ${filename}`);
    } catch (error) {
      this.logger.warn(`Failed to save frame HTML: ${filename}`);
    }
  }

  /**
   * Save raw HTML string to file (only if enabled)
   */
  saveRawHTML(content: string, filename: string): void {
    if (!this.enabled) {
      this.logger.debug(`HTML saving disabled, skipping: ${filename}`);
      return;
    }
    
    try {
      const filePath = path.join(this.htmlDir, filename);
      fs.writeFileSync(filePath, content);
      this.logger.debug(`Raw HTML saved: ${filename}`);
    } catch (error) {
      this.logger.warn(`Failed to save raw HTML: ${filename}`);
    }
  }

  /**
   * Check if HTML saving is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get output directory
   */
  getOutputDir(): string {
    return this.htmlDir;
  }
}

/**
 * Create an HTML saver instance
 */
export function createHTMLSaver(config?: HTMLSaverConfig): HTMLSaver {
  return new HTMLSaver(config);
}

} 