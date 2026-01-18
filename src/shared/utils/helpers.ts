/**
 * Safely extract an error message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class Helpers {
  
  static async waitForTimeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static maskSensitiveData(text: string, visibleChars: number = 3): string {
    if (!text || text.length <= visibleChars) {
      return '*'.repeat(text.length);
    }
    return text.substring(0, visibleChars) + '*'.repeat(text.length - visibleChars);
  }

  static formatCurrency(amount: number, currency: string = 'VES'): string {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  static formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('es-VE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  static formatDateTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('es-VE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  static validateEnvironmentVariables(): { valid: boolean; missing: string[] } {
    const required = ['BANESCO_USERNAME', 'BANESCO_PASSWORD', 'SECURITY_QUESTIONS'];
    const missing: string[] = [];

    for (const envVar of required) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  static logEnvironmentStatus(): void {
    const envCheck = this.validateEnvironmentVariables();
    
    if (envCheck.valid) {
      console.log('[env] all required variables present');
    } else {
      console.log('[env] missing variables:', envCheck.missing.join(', '));
    }
  }

  static logScrapingStats(accounts: number, transactions: number): void {
    console.log(`[stats] accounts=${accounts} transactions=${transactions} ts=${new Date().toISOString()}`);
  }

  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retryAsync<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        console.log(`Attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        await this.delay(delayMs);
      }
    }
    throw new Error('Retry exhausted');
  }
} 