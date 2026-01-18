import { Frame } from 'playwright';
import { SecurityQuestionMap } from '../types/index.js';
import { createLogger, truncateForLog, type LogLevel } from '../../../shared/utils/logger.js';

export interface SecurityQuestionsConfig {
  /** Log level for security questions handler (default: 'warn') */
  logLevel?: LogLevel;
}

export class SecurityQuestionsHandler {
  private questionMap: SecurityQuestionMap;
  private logger;

  constructor(securityQuestionsConfig: string, config: SecurityQuestionsConfig = {}) {
    this.logger = createLogger('SecurityQuestions', { level: config.logLevel });
    this.questionMap = this.parseSecurityQuestions(securityQuestionsConfig);
  }

  private parseSecurityQuestions(securityQuestions: string): SecurityQuestionMap {
    const questionMap: SecurityQuestionMap = {};
    
    if (!securityQuestions) {
      this.logger.warn('No security questions configuration found');
      return questionMap;
    }
    
    const pairs = securityQuestions.split(',');
    
    for (const pair of pairs) {
      const [keyword, answer] = pair.split(':');
      if (keyword && answer) {
        const normalizedKeyword = keyword.trim().toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''); // Remove accents
        
        questionMap[normalizedKeyword] = answer.trim();
        // SECURITY: Never log the actual answer, only indicate a mapping was loaded
        this.logger.debug(`Loaded security question mapping for keyword: "${truncateForLog(keyword.trim(), 4)}"`);
      }
    }
    
    this.logger.info(`Loaded ${Object.keys(questionMap).length} security question mappings`);
    return questionMap;
  }

  private normalizeText(text: string): string {
    return text.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[¿?¡!]/g, '') // Remove question marks and exclamations
      .trim();
  }

  private findMatchingAnswer(questionText: string): string | null {
    const normalizedQuestion = this.normalizeText(questionText);
    
    for (const [keyword, answer] of Object.entries(this.questionMap)) {
      if (normalizedQuestion.includes(keyword)) {
        // SECURITY: Log that we found a match, but never log the answer
        this.logger.debug(`Found matching keyword for question`);
        return answer;
      }
    }
    
    return null;
  }

  async handleSecurityQuestions(frame: any): Promise<boolean> {
    this.logger.info('Handling security questions...');
    
    if (Object.keys(this.questionMap).length === 0) {
      this.logger.warn('No security questions configured');
      return false;
    }
    
    this.logger.debug(`${Object.keys(this.questionMap).length} mappings available`);
    
    // Look for known question elements
    const questionElements = [
      { labelId: 'lblPrimeraP', inputId: 'txtPrimeraR' },
      { labelId: 'lblSegundaP', inputId: 'txtSegundaR' },
      { labelId: 'lblTerceraP', inputId: 'txtTerceraR' },
      { labelId: 'lblCuartaP', inputId: 'txtCuartaR' }
    ];
    
    let answersProvided = 0;
    
    for (const element of questionElements) {
      try {
        // Check if the question label exists
        const labelElement = await frame.$(`#${element.labelId}`);
        if (!labelElement) {
          continue;
        }
        
        // Get the question text
        const questionText = await labelElement.textContent();
        if (!questionText) {
          continue;
        }
        
        // SECURITY: Only log a truncated version of the question
        this.logger.debug(`Processing question: "${truncateForLog(questionText, 20)}..."`);
        
        // Look for an answer for this question
        const answer = this.findMatchingAnswer(questionText);
        
        if (answer) {
          // Check if the input field exists
          const inputElement = await frame.$(`#${element.inputId}`);
          if (!inputElement) {
            continue;
          }
          
          // Check if the field is visible and enabled
          const isVisible = await inputElement.isVisible();
          const isEnabled = await inputElement.isEnabled();
          
          if (!isVisible || !isEnabled) {
            continue;
          }
          
          // Fill the field
          try {
            this.logger.debug(`Filling answer field: ${element.inputId}`);
            await inputElement.click();
            await inputElement.fill(answer);
            await frame.waitForTimeout(300);
            answersProvided++;
            this.logger.debug('Field filled successfully');
            
          } catch (e) {
            this.logger.warn(`Failed to fill security question field: ${element.inputId}`);
          }
        }
        
      } catch (e) {
        // Continue to next question
      }
    }
    
    this.logger.info(`Security questions handled: ${answersProvided} answers provided`);
    return answersProvided > 0;
  }

  hasQuestions(): boolean {
    return Object.keys(this.questionMap).length > 0;
  }

  getQuestionCount(): number {
    return Object.keys(this.questionMap).length;
  }
}
