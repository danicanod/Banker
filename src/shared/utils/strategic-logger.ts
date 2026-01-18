/**
 * Strategic Logger - Minimal, structured logging for bank clients
 * 
 * Output format: "timestamp level [component] message"
 * No emojis, no ASCII banners, just clean structured logs.
 */

export enum LogLevel {
  Silent = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Trace = 5
}

export enum LogContext {
  Production = 'production',
  Development = 'development',
  Testing = 'testing',
  Debug = 'debug'
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  operationName: string;
}

export interface FitnessFunction {
  name: string;
  evaluate: (metrics: PerformanceMetrics) => {
    passed: boolean;
    score: number;
    message: string;
  };
}

export class StrategicLogger {
  private static instance: StrategicLogger;
  private logLevel: LogLevel;
  private context: LogContext;
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private fitnessThresholds: Map<string, number> = new Map();
  
  // Terminal colors (used only for level indicators)
  private colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
  };

  private constructor() {
    this.context = this.determineContext();
    this.logLevel = this.determineLogLevel();
    this.setupFitnessThresholds();
  }

  public static getInstance(): StrategicLogger {
    if (!StrategicLogger.instance) {
      StrategicLogger.instance = new StrategicLogger();
    }
    return StrategicLogger.instance;
  }

  private determineContext(): LogContext {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    const testMode = process.env.TEST_MODE === 'true';
    const debugMode = process.env.DEBUG === 'true';

    if (debugMode) return LogContext.Debug;
    if (testMode) return LogContext.Testing;
    if (nodeEnv === 'production') return LogContext.Production;
    return LogContext.Development;
  }

  private determineLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    
    switch (this.context) {
      case LogContext.Production:
        return LogLevel.Warn;
      case LogContext.Testing:
        return LogLevel.Info;
      case LogContext.Debug:
        return LogLevel.Trace;
      case LogContext.Development:
      default:
        return envLevel === 'debug' ? LogLevel.Debug : LogLevel.Info;
    }
  }

  private setupFitnessThresholds(): void {
    this.fitnessThresholds.set('login_time', 15000);
    this.fitnessThresholds.set('navigation_time', 10000);
    this.fitnessThresholds.set('extraction_time', 5000);
    this.fitnessThresholds.set('memory_usage', 100 * 1024 * 1024);
    this.fitnessThresholds.set('network_requests', 300);
  }

  private formatMessage(level: string, component: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString().substring(11, 23);
    const levelColor = this.getLevelColor(level);
    const lvl = level.toLowerCase().padEnd(5);
    
    let formatted = `${this.colors.gray}${timestamp}${this.colors.reset} ${levelColor}${lvl}${this.colors.reset} ${this.colors.cyan}[${component}]${this.colors.reset} ${message}`;
    
    if (data && this.logLevel >= LogLevel.Debug) {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      if (dataStr.length < 200) {
        formatted += ` ${this.colors.gray}${dataStr}${this.colors.reset}`;
      }
    }
    
    return formatted;
  }

  private getLevelColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'error': return this.colors.red;
      case 'warn': return this.colors.yellow;
      case 'info': return this.colors.blue;
      case 'debug': return this.colors.magenta;
      case 'trace': return this.colors.gray;
      default: return this.colors.reset;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  // Public logging methods
  public error(component: string, message: string, error?: Error | unknown): void {
    if (!this.shouldLog(LogLevel.Error)) return;
    
    console.error(this.formatMessage('error', component, message));
    
    if (error && this.context !== LogContext.Production) {
      const err = error as Error;
      if (err.stack) {
        console.error(`${this.colors.gray}${err.stack}${this.colors.reset}`);
      }
    }
  }

  public warn(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Warn)) return;
    console.warn(this.formatMessage('warn', component, message, data));
  }

  public info(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Info)) return;
    console.log(this.formatMessage('info', component, message, data));
  }

  public debug(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Debug)) return;
    console.log(this.formatMessage('debug', component, message, data));
  }

  public trace(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Trace)) return;
    console.log(this.formatMessage('trace', component, message, data));
  }

  public success(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Info)) return;
    console.log(this.formatMessage('info', component, message, data));
  }

  public performance(component: string, message: string, metrics?: PerformanceMetrics): void {
    if (!this.shouldLog(LogLevel.Info)) return;
    
    let msg = message;
    if (metrics?.duration) {
      msg += ` (${metrics.duration}ms)`;
    }
    
    console.log(this.formatMessage('info', component, msg));
  }

  public network(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Debug)) return;
    console.log(this.formatMessage('debug', component, message, data));
  }

  public security(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Warn)) return;
    console.log(this.formatMessage('warn', component, message, data));
  }

  public data(component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.Debug)) return;
    console.log(this.formatMessage('debug', component, message, data));
  }

  // Performance tracking
  public startOperation(operationName: string): string {
    const operationId = `${operationName}_${Date.now()}`;
    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      operationName,
      memoryUsage: process.memoryUsage()
    };
    
    this.performanceMetrics.set(operationId, metrics);
    this.trace('Perf', `started: ${operationName}`);
    
    return operationId;
  }

  public endOperation(operationId: string): PerformanceMetrics | null {
    const metrics = this.performanceMetrics.get(operationId);
    if (!metrics) {
      this.warn('Perf', `operation not found: ${operationId}`);
      return null;
    }

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    this.performanceMetrics.delete(operationId);
    this.evaluateFitness(metrics);
    this.performance('Perf', `completed: ${metrics.operationName}`, metrics);
    
    return metrics;
  }

  private evaluateFitness(metrics: PerformanceMetrics): void {
    if (!this.shouldLog(LogLevel.Debug)) return;

    const threshold = this.fitnessThresholds.get(`${metrics.operationName}_time`) || 
                     this.fitnessThresholds.get('default_time') || 10000;
    const passed = (metrics.duration || 0) <= threshold;
    
    if (!passed) {
      this.warn('Fitness', `${metrics.operationName} exceeded threshold: ${metrics.duration}ms > ${threshold}ms`);
    }
  }

  // Configuration
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public setContext(context: LogContext): void {
    this.context = context;
    this.logLevel = this.determineLogLevel();
  }

  public getConfig(): { level: LogLevel; context: LogContext } {
    return { level: this.logLevel, context: this.context };
  }

  // Component logger factory
  public createComponentLogger(componentName: string) {
    return {
      error: (message: string, error?: Error | unknown) => this.error(componentName, message, error),
      warn: (message: string, data?: unknown) => this.warn(componentName, message, data),
      info: (message: string, data?: unknown) => this.info(componentName, message, data),
      debug: (message: string, data?: unknown) => this.debug(componentName, message, data),
      trace: (message: string, data?: unknown) => this.trace(componentName, message, data),
      success: (message: string, data?: unknown) => this.success(componentName, message, data),
      performance: (message: string, metrics?: PerformanceMetrics) => this.performance(componentName, message, metrics),
      network: (message: string, data?: unknown) => this.network(componentName, message, data),
      security: (message: string, data?: unknown) => this.security(componentName, message, data),
      data: (message: string, data?: unknown) => this.data(componentName, message, data),
      startOperation: (operationName: string) => this.startOperation(operationName),
      endOperation: (operationId: string) => this.endOperation(operationId)
    };
  }

  // Simplified session info (no ASCII banners)
  public generateSessionReport(): void {
    if (!this.shouldLog(LogLevel.Info)) return;
    this.info('Session', `context=${this.context} level=${LogLevel[this.logLevel]}`);
  }
}
