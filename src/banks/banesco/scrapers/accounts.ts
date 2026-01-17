import { Page } from 'playwright';
import { Account, ScrapingResult } from '../types/index.js';
import { HTMLSaver } from '../../../shared/utils/html-saver.js';

export class AccountsScraper {
  private htmlSaver: HTMLSaver;

  constructor() {
    this.htmlSaver = new HTMLSaver();
  }

  async scrapeAccounts(page: Page): Promise<ScrapingResult<Account>> {
    console.log('🏦 Iniciando scraping de cuentas...');
    
    try {
      // Guardar HTML actual para análisis
      await this.htmlSaver.saveHTML(page, 'accounts-scraping-start.html');
      
      // Verificar que estamos en la página correcta
      const pageTitle = await page.title();
      const pageContent = await page.content();
      
      if (!pageContent.includes('Banesco') || pageContent.includes('Login')) {
        return {
          success: false,
          error: 'No se está en la página bancaria correcta',
          timestamp: new Date()
        };
      }

      console.log(`📄 Página actual: ${pageTitle}`);
      
      // Buscar enlaces o elementos que contengan información de cuentas
      const accountLinks = await page.$$eval('a', links => {
        return links
          .map(link => ({
            text: link.textContent?.trim() || '',
            href: link.href || '',
            innerHTML: link.innerHTML
          }))
          .filter(link => 
            link.text.includes('cuenta') || 
            link.text.includes('Cuenta') ||
            link.text.includes('CUENTA') ||
            link.href.includes('cuenta') ||
            link.href.includes('Cuenta') ||
            link.href.includes('MovimientosCuenta')
          );
      });

      console.log(`🔗 Enlaces de cuentas encontrados: ${accountLinks.length}`);
      
      if (accountLinks.length > 0) {
        accountLinks.forEach((link, index) => {
          console.log(`   ${index + 1}. ${link.text} → ${link.href}`);
        });
      }

      // Buscar elementos que contengan información de balance o números de cuenta
      const accountElements = await page.$$eval('*', elements => {
        const accountInfo: any[] = [];
        
        elements.forEach(el => {
          const text = el.textContent?.trim() || '';
          
          // Buscar patrones de números de cuenta (típicamente largos)
          const accountNumberPattern = /\b\d{10,20}\b/g;
          const balancePattern = /\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*(?:Bs|BsF|Bolívares?)?\b/gi;
          
          const accountMatches = text.match(accountNumberPattern);
          const balanceMatches = text.match(balancePattern);
          
          if (accountMatches || balanceMatches) {
            accountInfo.push({
              element: el.tagName,
              text: text,
              accountNumbers: accountMatches,
              balances: balanceMatches,
              className: el.className,
              id: el.id
            });
          }
        });
        
        return accountInfo.slice(0, 20); // Limitar a 20 para evitar spam
      });

      console.log(`📊 Elementos con información bancaria: ${accountElements.length}`);
      
      if (accountElements.length > 0) {
        accountElements.forEach((element, index) => {
          console.log(`   ${index + 1}. ${element.element}: ${element.text.substring(0, 100)}...`);
          if (element.accountNumbers) {
            console.log(`      Números de cuenta: ${element.accountNumbers.join(', ')}`);
          }
          if (element.balances) {
            console.log(`      Balances: ${element.balances.join(', ')}`);
          }
        });
      }

      // Por ahora, crear cuentas de ejemplo basadas en los datos encontrados
      const accounts: Account[] = [];
      
      // Si encontramos enlaces de cuentas, crear entradas básicas
      accountLinks.forEach((link, index) => {
        accounts.push({
          accountNumber: `LINK_${index + 1}`,
          accountType: this.extractAccountType(link.text),
          balance: 0, // Se obtendrá en el scraping de transacciones
          currency: 'VES',
          status: 'active'
        });
      });

      // Si no se encontraron enlaces pero hay elementos con números de cuenta
      if (accounts.length === 0 && accountElements.length > 0) {
        accountElements.forEach((element, index) => {
          if (element.accountNumbers) {
            element.accountNumbers.forEach((accountNumber: string) => {
              accounts.push({
                accountNumber: accountNumber,
                accountType: 'unknown',
                balance: 0,
                currency: 'VES',
                status: 'active'
              });
            });
          }
        });
      }

      console.log(`✅ Cuentas extraídas: ${accounts.length}`);
      
      return {
        success: true,
        data: accounts,
        timestamp: new Date()
      };

    } catch (error: any) {
      console.error('❌ Error en scraping de cuentas:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido',
        timestamp: new Date()
      };
    }
  }

  private extractAccountType(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('corriente')) return 'corriente';
    if (lowerText.includes('ahorro')) return 'ahorro';
    if (lowerText.includes('credito') || lowerText.includes('crédito')) return 'credito';
    if (lowerText.includes('tarjeta')) return 'tarjeta';
    
    return 'unknown';
  }

  async getFirstAccountLink(page: Page): Promise<string | null> {
    console.log('🔍 Buscando primer enlace de cuenta...');
    
    const currentUrl = page.url();
    console.log(`📍 URL actual: ${currentUrl}`);
    
    try {
      // Primero intentar el selector original para Default.aspx
      const firstAccountLink = await page.$eval(
        '#ctl00_FastMenu a[href="/Mantis/WebSite/consultamovimientoscuenta/movimientoscuenta.aspx"]', 
        (link: HTMLAnchorElement) => link.href
      );
      
      console.log(`🎯 Primer enlace de cuenta: ${firstAccountLink}`);
      return firstAccountLink;
      
    } catch (error) {
      console.log('⚠️  No se encontró enlace en página principal, verificando si hay iframe...');
      
      // Verificar si estamos en index.aspx con iframe
      if (currentUrl.includes('index.aspx')) {
        console.log('📄 Detectada página index.aspx, buscando iframe...');
        
        try {
          // Buscar el iframe
          const iframe = await page.$('iframe[src*="CAU/inicio/inicio.aspx"]');
          if (iframe) {
            console.log('✅ Iframe encontrado, accediendo al contenido...');
            
            const iframeContent = await iframe.contentFrame();
            if (iframeContent) {
              console.log('🔍 Buscando enlaces de cuenta en iframe...');
              
              // Buscar enlaces que contengan "cuenta" o "movimientos"
              const accountLinks = await iframeContent.$$eval('a', links => {
                return links
                  .map(link => ({
                    text: link.textContent?.trim() || '',
                    href: link.href || '',
                    innerHTML: link.innerHTML
                  }))
                  .filter(link => 
                    link.text.toLowerCase().includes('cuenta') || 
                    link.text.toLowerCase().includes('movimiento') ||
                    link.href.includes('movimiento') ||
                    link.href.includes('cuenta')
                  );
              });
              
              console.log(`🔗 Enlaces de cuenta encontrados en iframe: ${accountLinks.length}`);
              accountLinks.forEach((link, index) => {
                console.log(`   ${index + 1}. ${link.text} → ${link.href}`);
              });
              
              // Retornar el primer enlace válido
              if (accountLinks.length > 0) {
                const firstLink = accountLinks[0];
                console.log(`🎯 Seleccionando primer enlace: ${firstLink.href}`);
                return firstLink.href;
              }
            }
          }
        } catch (iframeError) {
          console.log('⚠️  Error accediendo al iframe:', iframeError);
        }
      }
      
      // Si no encontramos nada, intentar navegar directamente
      console.log('🔄 Intentando navegar directamente a la página de movimientos...');
      const directUrl = 'https://www.banesconline.com/Mantis/WebSite/consultamovimientoscuenta/movimientoscuenta.aspx';
      console.log(`🎯 URL directa: ${directUrl}`);
      return directUrl;
    }
  }

  async navigateToAccountDetails(page: Page, accountNumber?: string): Promise<boolean> {
    console.log('🚀 Navegando a detalles de cuenta con selección automática de período...');
    
    try {
      // Paso 1: Navegar a la página de cuentas
      const accountsLink = await this.getFirstAccountLink(page);
      if (accountsLink) {
        console.log('📍 Navegando a página de cuentas...');
        await page.goto(accountsLink, { 
          waitUntil: 'networkidle',
          timeout: 30000 
        });
        await page.waitForTimeout(2000);
        
        // Guardar HTML para debug
        await this.htmlSaver.saveHTML(page, 'accounts-main-page.html');
        
        // Verificar si estamos en una página con iframe
        const currentUrl = page.url();
        console.log(`📍 URL después de navegación: ${currentUrl}`);
        
        if (currentUrl.includes('index.aspx') || currentUrl.includes('login.aspx')) {
          console.log('📄 Detectada página con iframe, accediendo al contenido...');
          
          // Buscar el iframe
          const iframe = await page.$('iframe[src*="CAU/inicio/inicio.aspx"]');
          if (iframe) {
            console.log('✅ Iframe encontrado, esperando carga...');
            await page.waitForTimeout(3000);
            
            const iframeContent = await iframe.contentFrame();
            if (iframeContent) {
              console.log('🔍 Buscando enlaces de cuenta en iframe...');
              
              // Buscar enlaces que contengan "cuenta" o "movimientos"
              const accountLinks = await iframeContent.$$eval('a', links => {
                return links
                  .map(link => ({
                    text: link.textContent?.trim() || '',
                    href: link.href || '',
                    innerHTML: link.innerHTML
                  }))
                  .filter(link => 
                    link.text.toLowerCase().includes('cuenta') || 
                    link.text.toLowerCase().includes('movimiento') ||
                    link.href.includes('movimiento') ||
                    link.href.includes('cuenta')
                  );
              });
              
              console.log(`🔗 Enlaces de cuenta encontrados en iframe: ${accountLinks.length}`);
              accountLinks.forEach((link, index) => {
                console.log(`   ${index + 1}. ${link.text} → ${link.href}`);
              });
              
              // Hacer clic en el primer enlace válido
              if (accountLinks.length > 0) {
                const firstLink = accountLinks[0];
                console.log(`🎯 Haciendo clic en: ${firstLink.text}`);
                
                // Buscar el enlace en el iframe y hacer clic
                const linkElement = await iframeContent.$(`a[href="${firstLink.href}"]`);
                if (linkElement) {
                  await linkElement.click();
                  
                  console.log('⏳ Esperando navegación a página de movimientos...');
                  await page.waitForLoadState('networkidle');
                  await page.waitForTimeout(3000);
                  
                  // Guardar HTML después de hacer clic
                  await this.htmlSaver.saveHTML(page, 'accounts-after-iframe-click.html');
                }
              }
            }
          }
        }
      }

      // Paso 2: Seleccionar cuenta del dropdown
      console.log('🔍 Buscando dropdown de cuentas...');
      
      const dropdownSelector = 'select[id*="ddlCuenta"], select[name*="ddlCuenta"]';
      const dropdown = await page.$(dropdownSelector);
      
      if (dropdown) {
        console.log('✅ Dropdown de cuentas encontrado');
        
        // Obtener todas las opciones del dropdown
        const options = await page.$$eval(`${dropdownSelector} option`, (opts: HTMLOptionElement[]) => {
          return opts.map(option => ({
            value: option.value,
            text: option.textContent?.trim() || '',
            selected: option.selected
          }));
        });

        console.log(`📊 Opciones en el dropdown: ${options.length}`);
        options.forEach((opt, index) => {
          if (opt.value) {
            console.log(`   ${index}. ${opt.text} (value: ${opt.value})`);
          }
        });

        // Seleccionar la primera cuenta con valor válido
        const accountOption = options.find(opt => opt.value && opt.value !== '');
        
        if (accountOption) {
          console.log(`🎯 Seleccionando cuenta: ${accountOption.text}`);
          
          // Seleccionar la cuenta
          await page.selectOption(dropdownSelector, accountOption.value);
          
          // Esperar a que la página se actualice después de la selección
          console.log('⏳ Esperando actualización de la página...');
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(3000);
          
          // Guardar HTML después de seleccionar cuenta
          await this.htmlSaver.saveHTML(page, 'account-selected-page.html');
        }
      } else {
        console.log('⚠️  No se encontró dropdown de cuentas');
      }

      // Paso 3: Buscar enlaces o botones para ver movimientos
      console.log('🔍 Buscando opciones para ver movimientos...');
      
      // Primero verificar si ya estamos en la página de movimientos
      const pageContent = await page.content();
      const isMovementsPage = pageContent.includes('Movimientos') && 
                              pageContent.includes('btnMostrar') && 
                              pageContent.includes('Consultar');

      if (isMovementsPage) {
        console.log('✅ Ya estamos en la página de movimientos');
        
        // PASO 3.1: Intentar múltiples períodos hasta encontrar transacciones
        const periodsToTry = [
          { value: 'PeriodoDiaAnterior', name: 'Día Anterior' },
          { value: 'PeriodoSemanaAnterior', name: 'Semana Anterior' },
          { value: 'PeriodoMesAnterior', name: 'Mes Anterior' },
          { value: 'PeriodoTrimestre', name: 'Trimestre Anterior' },
          { value: 'PeriodoSemestre', name: 'Semestre Anterior' }
        ];

        for (const period of periodsToTry) {
          console.log(`\n📅 Intentando período: ${period.name}...`);
          
          const success = await this.tryPeriodAndConsult(page, period.value, period.name);
          if (success) {
            console.log(`🎯 ¡Éxito! Encontradas transacciones con período: ${period.name}`);
            return true;
          } else {
            console.log(`⚠️  No se encontraron transacciones en: ${period.name}`);
          }
          
          // Esperar un poco antes del siguiente intento
          await page.waitForTimeout(1000);
        }
        
        console.log('❌ No se encontraron transacciones en ningún período');
        return false;
      }
      
      // Si no estamos en la página de movimientos, buscar enlaces
      const transactionSelectors = [
        'a[href*="movimientos"]',
        'a[href*="Movimientos"]',
        'a[href*="transacciones"]',
        'a[href*="consultar"]',
        'input[type="submit"][value*="Consultar"]',
        'input[type="button"][value*="Consultar"]',
        'button:has-text("Consultar")',
        'a:has-text("Ver movimientos")',
        'a:has-text("Consultar movimientos")'
      ];

      let clicked = false;
      
      for (const selector of transactionSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const elementText = await element.textContent();
            console.log(`✅ Encontrado elemento: ${elementText || selector}`);
            
            await element.click();
            clicked = true;
            
            console.log('⏳ Esperando carga de movimientos...');
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000);
            
            // Guardar HTML de la página de movimientos
            await this.htmlSaver.saveHTML(page, 'account-movements-page.html');
            
            break;
          }
        } catch (e) {
          // Continuar con el siguiente selector
        }
      }

      if (!clicked && !isMovementsPage) {
        console.log('⚠️  No se encontró botón o enlace para ver movimientos');
        return false;
      }

      const newTitle = await page.title();
      const newUrl = page.url();
      console.log(`\n📄 Página final: ${newTitle}`);
      console.log(`🔗 URL final: ${newUrl}`);
      
      return true;

    } catch (error: any) {
      console.error('❌ Error navegando a detalles de cuenta:', error);
      return false;
    }
  }

  private async tryPeriodAndConsult(page: Page, periodValue: string, periodName: string): Promise<boolean> {
    try {
      console.log(`🔄 Configurando período a "${periodName}"...`);
      
      const periodDropdown = await page.$('#ctl00_cp_ddlPeriodo');
      
      if (!periodDropdown) {
        console.log('⚠️  No se encontró el dropdown de período');
        return false;
      }
      
      // Obtener opciones actuales
      const periodOptions = await page.$$eval('#ctl00_cp_ddlPeriodo option', (opts: HTMLOptionElement[]) => {
        return opts.map(option => ({
          value: option.value,
          text: option.textContent?.trim() || '',
          selected: option.selected
        }));
      });

      console.log(`📊 Opciones de período disponibles:`);
      periodOptions.forEach((opt, index) => {
        const status = opt.selected ? ' (SELECCIONADO)' : '';
        console.log(`   ${index + 1}. ${opt.text} (value: ${opt.value})${status}`);
      });

      // Buscar la opción deseada
      const targetOption = periodOptions.find(opt => 
        opt.value === periodValue || 
        opt.text.toLowerCase().includes(periodName.toLowerCase())
      );
      
      if (!targetOption) {
        console.log(`⚠️  No se encontró la opción "${periodName}" en el dropdown`);
        return false;
      }

      console.log(`🎯 Seleccionando: ${targetOption.text}`);
      await page.selectOption('#ctl00_cp_ddlPeriodo', targetOption.value);
      
      // Esperar un momento para que se actualice la página
      await page.waitForTimeout(2000);
      console.log(`✅ Período "${periodName}" seleccionado`);

      // Buscar y hacer clic en el botón Consultar
      const consultarButton = await page.$('input[value="Consultar"]');
      if (!consultarButton) {
        console.log('⚠️  No se encontró el botón "Consultar"');
        return false;
      }

      console.log(`🔍 Haciendo clic en "Consultar" con período "${periodName}"...`);
      await consultarButton.click();
      
      console.log('⏳ Esperando carga de movimientos...');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Guardar HTML después de consultar
      await this.htmlSaver.saveHTML(page, `account-movements-${periodValue}.html`);
      
      // Verificar si se encontraron transacciones
      const hasTransactions = await this.checkForTransactions(page);
      
      if (hasTransactions) {
        console.log(`🎉 ¡Transacciones encontradas con período "${periodName}"!`);
        const newTitle = await page.title();
        const newUrl = page.url();
        console.log(`📄 Página final: ${newTitle}`);
        console.log(`🔗 URL final: ${newUrl}`);
        return true;
      } else {
        console.log(`📭 No se encontraron transacciones en período "${periodName}"`);
        return false;
      }

    } catch (error) {
      console.log(`❌ Error intentando período "${periodName}":`, error);
      return false;
    }
  }

  private async checkForTransactions(page: Page): Promise<boolean> {
    try {
      const pageContent = await page.content();
      
      // Patrones que indican que NO hay transacciones
      const noMovementsPatterns = [
        'no posee movimientos',
        'No posee movimientos',
        'NO POSEE MOVIMIENTOS',
        'no hay movimientos',
        'no existen movimientos',
        'sin movimientos',
        'no se encontraron movimientos',
        'no hay registros',
        'sin registros para mostrar'
      ];

      const hasNoMovements = noMovementsPatterns.some(pattern => 
        pageContent.includes(pattern)
      );

      if (hasNoMovements) {
        console.log('📭 Detectado mensaje de "no hay movimientos"');
        return false;
      }

      // Buscar indicadores de que SÍ hay transacciones
      const transactionIndicators = [
        'table',
        'tbody',
        'movimiento',
        'transaccion',
        'fecha.*monto',
        'saldo.*actual'
      ];

      // Contar tablas que podrían contener transacciones
      const tablesCount = await page.$$eval('table', tables => {
        return tables.filter(table => {
          const text = table.textContent?.toLowerCase() || '';
          return text.includes('fecha') && 
                 text.includes('saldo') && 
                 table.rows.length > 1;
        }).length;
      });

      if (tablesCount > 0) {
        console.log(`📊 Encontradas ${tablesCount} tablas con posibles transacciones`);
        return true;
      }

      // Buscar filas de datos que puedan ser transacciones
      const dataRowsCount = await page.$$eval('tr', rows => {
        return rows.filter(row => {
          const text = row.textContent?.toLowerCase() || '';
          const hasDate = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(text);
          const hasAmount = /\d{1,3}(?:\.\d{3})*(?:,\d{2})?/.test(text);
          return hasDate && hasAmount && row.cells.length >= 3;
        }).length;
      });

      if (dataRowsCount > 0) {
        console.log(`📋 Encontradas ${dataRowsCount} filas con posibles datos de transacciones`);
        return true;
      }

      console.log('❌ No se detectaron indicadores de transacciones');
      return false;

    } catch (error) {
      console.log('⚠️  Error verificando transacciones:', error);
      return false;
    }
  }
}