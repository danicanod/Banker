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
      console.log('✅ Variables de entorno configuradas correctamente');
    } else {
      console.log('❌ Variables de entorno faltantes:');
      envCheck.missing.forEach(varName => {
        console.log(`   - ${varName}`);
      });
      console.log('\n💡 Revisa tu archivo .env');
    }
  }

  static logScrapingStats(accounts: number, transactions: number): void {
    console.log('\n📊 ESTADÍSTICAS DE SCRAPING:');
    console.log('============================');
    console.log(`🏦 Cuentas extraídas: ${accounts}`);
    console.log(`💳 Transacciones extraídas: ${transactions}`);
    console.log(`⏱️  Timestamp: ${this.formatDateTime(new Date())}`);
  }

  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static retryAsync<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await fn();
          resolve(result);
          return;
        } catch (error) {
          console.log(`⚠️  Intento ${attempt}/${maxRetries} falló:`, error);
          
          if (attempt === maxRetries) {
            reject(error);
            return;
          }
          
          await this.delay(delayMs);
        }
      }
    });
  }
} 