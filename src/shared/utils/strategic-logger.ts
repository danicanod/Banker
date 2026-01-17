export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

export enum LogContext {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
  TESTING = 'testing',
  DEBUG = 'debug'
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
  
  // Terminal colors
  private colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
  };

  // Emojis for different log types
  private emojis = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔧',
    trace: '🔍',
    success: '✅',
    performance: '⚡',
    fitness: '🎯',
    network: '🌐',
    security: '🔒',
    data: '📊'
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

    if (debugMode) return LogContext.DEBUG;
    if (testMode) return LogContext.TESTING;
    if (nodeEnv === 'production') return LogContext.PRODUCTION;
    return LogContext.DEVELOPMENT;
  }

  private determineLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    
    switch (this.context) {
      case LogContext.PRODUCTION:
        return LogLevel.WARN;
      case LogContext.TESTING:
        return LogLevel.INFO;
      case LogContext.DEBUG:
        return LogLevel.TRACE;
      case LogContext.DEVELOPMENT:
      default:
        return envLevel === 'debug' ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private setupFitnessThresholds(): void {
    this.fitnessThresholds.set('login_time', 15000); // 15 segundos
    this.fitnessThresholds.set('navigation_time', 10000); // 10 segundos
    this.fitnessThresholds.set('extraction_time', 5000); // 5 segundos
    this.fitnessThresholds.set('memory_usage', 100 * 1024 * 1024); // 100MB
    this.fitnessThresholds.set('network_requests', 300); // Máximo 300 requests
  }

  private formatMessage(level: string, emoji: string, component: string, message: string, data?: any): string {
    const timestamp = new Date().toLocaleTimeString();
    const levelColor = this.getLevelColor(level);
    const componentBadge = `${this.colors.cyan}[${component}]${this.colors.reset}`;
    
    let formatted = `${this.colors.gray}${timestamp}${this.colors.reset} ${emoji} ${levelColor}${level.toUpperCase()}${this.colors.reset} ${componentBadge} ${message}`;
    
    if (data && this.logLevel >= LogLevel.DEBUG) {
      formatted += `\n${this.colors.gray}   Data: ${JSON.stringify(data, null, 2)}${this.colors.reset}`;
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
  public error(component: string, message: string, error?: Error | any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    console.error(this.formatMessage('error', this.emojis.error, component, message, error));
    
    if (error && this.context !== LogContext.PRODUCTION) {
      console.error(`${this.colors.red}Stack trace:${this.colors.reset}`);
      console.error(error.stack || error);
    }
  }

  public warn(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage('warn', this.emojis.warn, component, message, data));
  }

  public info(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage('info', this.emojis.info, component, message, data));
  }

  public debug(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.log(this.formatMessage('debug', this.emojis.debug, component, message, data));
  }

  public trace(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.TRACE)) return;
    console.log(this.formatMessage('trace', this.emojis.trace, component, message, data));
  }

  public success(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage('info', this.emojis.success, component, message, data));
  }

  public performance(component: string, message: string, metrics?: PerformanceMetrics): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    let performanceMsg = message;
    if (metrics?.duration) {
      performanceMsg += ` (${metrics.duration}ms)`;
    }
    
    console.log(this.formatMessage('info', this.emojis.performance, component, performanceMsg, metrics));
  }

  public network(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.log(this.formatMessage('debug', this.emojis.network, component, message, data));
  }

  public security(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.log(this.formatMessage('warn', this.emojis.security, component, message, data));
  }

  public data(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.log(this.formatMessage('debug', this.emojis.data, component, message, data));
  }

  // Performance and fitness function methods
  public startOperation(operationName: string): string {
    const operationId = `${operationName}_${Date.now()}`;
    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      operationName,
      memoryUsage: process.memoryUsage()
    };
    
    this.performanceMetrics.set(operationId, metrics);
    this.trace('Performance', `Started operation: ${operationName}`, { operationId });
    
    return operationId;
  }

  public endOperation(operationId: string): PerformanceMetrics | null {
    const metrics = this.performanceMetrics.get(operationId);
    if (!metrics) {
      this.warn('Performance', `Operation not found: ${operationId}`);
      return null;
    }

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    
    this.performanceMetrics.delete(operationId);
    
    // Evaluar fitness functions
    this.evaluateFitness(metrics);
    
    this.performance('Performance', `Completed operation: ${metrics.operationName}`, metrics);
    
    return metrics;
  }

  private evaluateFitness(metrics: PerformanceMetrics): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const fitnessTests: FitnessFunction[] = [
      {
        name: 'Performance Time',
        evaluate: (m) => {
          const threshold = this.fitnessThresholds.get(`${m.operationName}_time`) || 
                           this.fitnessThresholds.get('default_time') || 10000;
          const passed = (m.duration || 0) <= threshold;
          const score = Math.max(0, 100 - ((m.duration || 0) / threshold) * 100);
          return {
            passed,
            score: Math.round(score),
            message: `${m.duration}ms ${passed ? '≤' : '>'} ${threshold}ms threshold`
          };
        }
      },
      {
        name: 'Memory Efficiency',
        evaluate: (m) => {
          if (!m.memoryUsage) return { passed: true, score: 100, message: 'Memory data not available' };
          
          const threshold = this.fitnessThresholds.get('memory_usage') || 100 * 1024 * 1024;
          const used = m.memoryUsage.heapUsed;
          const passed = used <= threshold;
          const score = Math.max(0, 100 - (used / threshold) * 100);
          
          return {
            passed,
            score: Math.round(score),
            message: `${Math.round(used / 1024 / 1024)}MB ${passed ? '≤' : '>'} ${Math.round(threshold / 1024 / 1024)}MB threshold`
          };
        }
      }
    ];

    fitnessTests.forEach(test => {
      const result = test.evaluate(metrics);
      const emoji = result.passed ? '✅' : '❌';
      const scoreColor = result.score >= 80 ? this.colors.green : 
                        result.score >= 60 ? this.colors.yellow : this.colors.red;
      
      console.log(
        `${this.emojis.fitness} ${this.colors.cyan}[FITNESS]${this.colors.reset} ` +
        `${test.name}: ${emoji} ${scoreColor}${result.score}%${this.colors.reset} - ${result.message}`
      );
    });
  }

  // Configuration methods
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info('Logger', `Log level set to: ${LogLevel[level]}`);
  }

  public setContext(context: LogContext): void {
    this.context = context;
    this.logLevel = this.determineLogLevel();
    this.info('Logger', `Context set to: ${context}, Log level: ${LogLevel[this.logLevel]}`);
  }

  public getConfig(): { level: LogLevel; context: LogContext } {
    return { level: this.logLevel, context: this.context };
  }

  // Method to create component-specific loggers
  public createComponentLogger(componentName: string) {
    return {
      error: (message: string, error?: Error | any) => this.error(componentName, message, error),
      warn: (message: string, data?: any) => this.warn(componentName, message, data),
      info: (message: string, data?: any) => this.info(componentName, message, data),
      debug: (message: string, data?: any) => this.debug(componentName, message, data),
      trace: (message: string, data?: any) => this.trace(componentName, message, data),
      success: (message: string, data?: any) => this.success(componentName, message, data),
      performance: (message: string, metrics?: PerformanceMetrics) => this.performance(componentName, message, metrics),
      network: (message: string, data?: any) => this.network(componentName, message, data),
      security: (message: string, data?: any) => this.security(componentName, message, data),
      data: (message: string, data?: any) => this.data(componentName, message, data),
      startOperation: (operationName: string) => this.startOperation(operationName),
      endOperation: (operationId: string) => this.endOperation(operationId)
    };
  }

  // Method to generate session report
  public generateSessionReport(): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    console.log('\n' + '='.repeat(60));
    console.log(`${this.emojis.fitness} SESSION REPORT`);
    console.log('='.repeat(60));
    console.log(`Context: ${this.context}`);
    console.log(`Log Level: ${LogLevel[this.logLevel]}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');
  }
} 