/**
 * Unified Logger for Banker Scrapers
 * 
 * Provides configurable logging with sensible defaults for production:
 * - Minimal logging by default (warn level)
 * - No file logging by default
 * - Automatic redaction of sensitive values
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  /** Log level (default: 'warn') */
  level?: LogLevel;
  /** Component/module name for prefixing logs */
  component?: string;
  /** Enable file logging (default: false) */
  fileLogging?: boolean;
  /** File path for logs (only used if fileLogging is true) */
  logFilePath?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

/**
 * Determine log level from environment or use default
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  // Production-safe default: only warnings and errors
  return 'warn';
}

export class Logger {
  private level: LogLevel;
  private levelNum: number;
  private component: string;
  private fileLogging: boolean;
  private logFilePath?: string;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? getDefaultLogLevel();
    this.levelNum = LOG_LEVELS[this.level];
    this.component = config.component ?? 'Banker';
    this.fileLogging = config.fileLogging ?? false;
    this.logFilePath = config.logFilePath;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= this.levelNum;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.component}] ${message}`;
  }

  private writeToFile(message: string): void {
    if (!this.fileLogging || !this.logFilePath) return;
    
    try {
      // Dynamic import to avoid bundling fs in browser contexts
      import('fs').then(fs => {
        fs.appendFileSync(this.logFilePath!, message + '\n');
      }).catch(() => {
        // Silently fail if fs is not available
      });
    } catch {
      // Silently fail
    }
  }

  error(message: string, error?: Error | unknown): void {
    if (!this.shouldLog('error')) return;
    
    const formatted = this.formatMessage('error', message);
    console.error(formatted);
    
    if (error && this.levelNum >= LOG_LEVELS.debug) {
      console.error(error);
    }
    
    this.writeToFile(formatted);
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) return;
    
    const formatted = this.formatMessage('warn', message);
    console.warn(formatted);
    this.writeToFile(formatted);
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = this.formatMessage('info', message);
    console.log(formatted);
    this.writeToFile(formatted);
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    
    const formatted = this.formatMessage('debug', message);
    console.log(formatted);
    
    if (data !== undefined && this.levelNum >= LOG_LEVELS.debug) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
    
    this.writeToFile(formatted);
  }

  /**
   * Create a child logger with a different component name
   */
  child(component: string): Logger {
    return new Logger({
      level: this.level,
      component,
      fileLogging: this.fileLogging,
      logFilePath: this.logFilePath
    });
  }

  /**
   * Set log level dynamically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelNum = LOG_LEVELS[level];
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

// Singleton default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger instance
 */
export function getLogger(config?: LoggerConfig): Logger {
  if (!defaultLogger || config) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

/**
 * Create a component-specific logger
 */
export function createLogger(component: string, config?: Omit<LoggerConfig, 'component'>): Logger {
  return new Logger({ ...config, component });
}

/**
 * Redact sensitive values in an object for safe logging
 */
export function redactSensitive(
  obj: Record<string, unknown>,
  sensitiveKeys: string[] = ['password', 'clave', 'token', 'secret', 'cookie', 'session', 'answer']
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(k => keyLower.includes(k.toLowerCase()));
    
    if (isSensitive && typeof value === 'string') {
      result[key] = value.length > 0 ? '<redacted>' : '';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitive(value as Record<string, unknown>, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Safely truncate a string for logging (useful for usernames, etc.)
 */
export function truncateForLog(value: string, showChars: number = 3): string {
  if (value.length <= showChars) return '*'.repeat(value.length);
  return value.substring(0, showChars) + '***';
}
