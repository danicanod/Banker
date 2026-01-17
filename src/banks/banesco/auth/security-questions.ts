import { Frame } from 'playwright';
import { SecurityQuestionMap } from '../types/index.js';

export class SecurityQuestionsHandler {
  private questionMap: SecurityQuestionMap;

  constructor(securityQuestionsConfig: string) {
    this.questionMap = this.parseSecurityQuestions(securityQuestionsConfig);
  }

  private parseSecurityQuestions(securityQuestions: string): SecurityQuestionMap {
    const questionMap: SecurityQuestionMap = {};
    
    if (!securityQuestions) {
      console.log('⚠️  No security questions configuration found');
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
        console.log(`🔑 Mapped: "${keyword.trim()}" → "${answer.trim()}"`);
      }
    }
    
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
        console.log(`✅ Match found: "${keyword}" in "${questionText}"`);
        return answer;
      }
    }
    
    return null;
  }

  async handleSecurityQuestions(frame: any): Promise<boolean> {
    console.log('🔐 Handling security questions...');
    
    if (Object.keys(this.questionMap).length === 0) {
      console.log('❌ No questions configured');
      return false;
    }
    
    console.log(`🗂️  ${Object.keys(this.questionMap).length} mappings loaded`);
    
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
        
        console.log(`📋 Question: "${questionText}"`);
        
        // Look for an answer for this question
        const answer = this.findMatchingAnswer(questionText);
        
        if (answer) {
          console.log(`🎯 Answer: "${answer}"`);
          
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
            console.log(`✏️  Filling ${element.inputId}: "${answer}"`);
            await inputElement.click();
            await inputElement.fill(answer);
            await frame.waitForTimeout(300);
            answersProvided++;
            console.log(`   ✅ Field filled successfully`);
            
          } catch (e) {
            console.log(`   ❌ Error filling field`);
          }
        }
        
      } catch (e) {
        // Continue to next question
      }
    }
    
    console.log(`✅ Answers provided: ${answersProvided}`);
    return answersProvided > 0;
  }

  hasQuestions(): boolean {
    return Object.keys(this.questionMap).length > 0;
  }

  getQuestionCount(): number {
    return Object.keys(this.questionMap).length;
  }
} 