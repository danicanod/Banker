import { Page, Frame, Locator, ElementHandle } from 'playwright';
import { StrategicLogger } from './strategic-logger.js';

export class SmartWaiter {
  private static logger = StrategicLogger.getInstance().createComponentLogger('SmartWaiter');

  /**
   * Espera inteligente a que un elemento esté listo y estable
   */
  static async waitForElementReady(
    context: Page | Frame, 
    selector: string, 
    options: {
      timeout?: number;
      state?: 'visible' | 'attached' | 'detached' | 'hidden';
      stable?: boolean;
      description?: string;
    } = {}
  ): Promise<ElementHandle> {
    const { timeout = 8000, state = 'visible', stable = true, description = selector } = options;
    const operationId = this.logger.startOperation(`wait_element_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for element: ${selector}`, { 
        selector, 
        state, 
        stable, 
        timeout 
      });

      // Esperar a que el elemento aparezca
      const element = await context.waitForSelector(selector, { 
        timeout, 
        state 
      });

      if (!element) {
        throw new Error(`Element ${selector} not found`);
      }

      // Si se requiere estabilidad, esperar a que el elemento sea estable
      if (stable) {
        this.logger.trace(`Waiting for element stability: ${selector}`);
        await element.waitForElementState('stable', { timeout: 3000 });
      }

      this.logger.success(`Element ready: ${selector}`);
      this.logger.endOperation(operationId);
      
      return element;
      
    } catch (error) {
      this.logger.error(`Failed to wait for element: ${selector}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Espera inteligente a que el DOM esté listo
   */
  static async waitForDOMReady(
    context: Page | Frame, 
    options: {
      timeout?: number;
      networkIdle?: boolean;
      description?: string;
    } = {}
  ): Promise<void> {
    const { timeout = 10000, networkIdle = false, description = 'DOM ready' } = options;
    const operationId = this.logger.startOperation(`wait_dom_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for DOM ready`, { networkIdle, timeout });

      if (networkIdle) {
        await context.waitForLoadState('networkidle', { timeout });
        this.logger.trace('Network idle achieved');
      } else {
        await context.waitForLoadState('domcontentloaded', { timeout });
        this.logger.trace('DOM content loaded');
      }

      this.logger.success(`DOM ready: ${description}`);
      this.logger.endOperation(operationId);
      
    } catch (error) {
      this.logger.error(`Failed waiting for DOM: ${description}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Espera inteligente a que una condición se cumpla
   */
  static async waitForCondition(
    context: Page | Frame,
    condition: () => Promise<boolean> | boolean,
    options: {
      timeout?: number;
      interval?: number;
      description?: string;
    } = {}
  ): Promise<void> {
    const { timeout = 8000, interval = 100, description = 'condition' } = options;
    const operationId = this.logger.startOperation(`wait_condition_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for condition: ${description}`, { timeout, interval });

      await context.waitForFunction(condition, undefined, { 
        timeout, 
        polling: interval 
      });

      this.logger.success(`Condition met: ${description}`);
      this.logger.endOperation(operationId);
      
    } catch (error) {
      this.logger.error(`Condition timeout: ${description}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Espera a que un formulario esté completamente cargado y listo
   */
  static async waitForFormReady(
    context: Page | Frame,
    formSelector: string = 'form',
    options: {
      timeout?: number;
      requiredFields?: string[];
      description?: string;
    } = {}
  ): Promise<void> {
    const { timeout = 8000, requiredFields = [], description = 'form' } = options;
    const operationId = this.logger.startOperation(`wait_form_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for form ready: ${formSelector}`, { requiredFields, timeout });

      // Esperar a que el formulario aparezca
      await this.waitForElementReady(context, formSelector, { 
        timeout, 
        description: `${description} form` 
      });

      // Esperar a que los campos requeridos estén disponibles
      if (requiredFields.length > 0) {
        for (const field of requiredFields) {
          await this.waitForElementReady(context, field, { 
            timeout: 3000, 
            description: `${description} field ${field}` 
          });
        }
      }

      // Dar un momento para que cualquier JavaScript del formulario termine
      await this.smartDelay(300, `${description} form initialization`);

      this.logger.success(`Form ready: ${description}`);
      this.logger.endOperation(operationId);
      
    } catch (error) {
      this.logger.error(`Form not ready: ${description}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Delay inteligente solo cuando es realmente necesario
   */
  static async smartDelay(
    ms: number, 
    reason: string = 'smart delay'
  ): Promise<void> {
    if (ms <= 0) return;
    
    this.logger.trace(`Smart delay: ${ms}ms for ${reason}`);
    
    const operationId = this.logger.startOperation(`smart_delay_${reason.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    await new Promise(resolve => setTimeout(resolve, ms));
    
    this.logger.endOperation(operationId);
  }

  /**
   * Espera a que una página navegue y esté lista
   */
  static async waitForNavigation(
    page: Page,
    options: {
      timeout?: number;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      description?: string;
    } = {}
  ): Promise<void> {
    const { timeout = 15000, waitUntil = 'domcontentloaded', description = 'navigation' } = options;
    const operationId = this.logger.startOperation(`wait_navigation_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for navigation: ${description}`, { waitUntil, timeout });

      await page.waitForLoadState(waitUntil, { timeout });

      this.logger.success(`Navigation complete: ${description}`);
      this.logger.endOperation(operationId);
      
    } catch (error) {
      this.logger.error(`Navigation timeout: ${description}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }

  /**
   * Espera a que un iframe esté listo y accesible
   */
  static async waitForIframeReady(
    page: Page,
    iframeSelector: string,
    options: {
      timeout?: number;
      description?: string;
    } = {}
  ): Promise<Frame> {
    const { timeout = 10000, description = 'iframe' } = options;
    const operationId = this.logger.startOperation(`wait_iframe_${description.replace(/[^a-zA-Z0-9]/g, '_')}`);
    
    try {
      this.logger.trace(`Waiting for iframe ready: ${iframeSelector}`, { timeout });

      // Esperar a que el iframe aparezca
      const iframeElement = await this.waitForElementReady(page, iframeSelector, {
        timeout,
        description: `${description} element`
      });

      // Get the frame content
      const frame = await iframeElement.contentFrame();
      if (!frame) {
        throw new Error(`Could not access iframe content: ${iframeSelector}`);
      }

      // Esperar a que el frame esté listo
      await this.waitForDOMReady(frame, { 
        timeout: 5000, 
        description: `${description} content` 
      });

      this.logger.success(`Iframe ready: ${description}`);
      this.logger.endOperation(operationId);
      
      return frame;
      
    } catch (error) {
      this.logger.error(`Iframe not ready: ${description}`, error);
      this.logger.endOperation(operationId);
      throw error;
    }
  }
} 