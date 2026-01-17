/**
 * Banesco Scraper Usage Examples
 * 
 * This file demonstrates how to use the modern Banesco scraper with various
 * configurations and scenarios.
 */

import { BanescoAuth } from '../auth/banesco-auth.js';
import type { BanescoCredentials, BanescoAuthConfig } from '../types/index.js';

// Example credentials (replace with real values)
const exampleCredentials: BanescoCredentials = {
  username: process.env.BANESCO_USERNAME || 'your_username',
  password: process.env.BANESCO_PASSWORD || 'your_password', 
  securityQuestions: process.env.BANESCO_SECURITY_QUESTIONS || 'madre:maria,colegio:central,mascota:firulais'
};

/**
 * Example 1: Basic authentication
 */
async function basicAuthExample() {
  console.log('🏦 Example 1: Basic Banesco Authentication');
  
  const auth = new BanescoAuth(exampleCredentials);
  
  try {
    const result = await auth.login();
    
    if (result.success) {
      console.log('✅ Authentication successful!');
      console.log('Session valid:', result.sessionValid);
      
      // Check status
      console.log('Logged in:', auth.isLoggedIn());
      console.log('Current URL:', await auth.getCurrentUrl());
      
      // Get authenticated page for further operations
      const page = auth.getPage();
      if (page) {
        console.log('📄 Authenticated page ready for banking operations');
      }
    } else {
      console.log('❌ Authentication failed:', result.message);
    }
    
  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    await auth.close();
  }
}

/**
 * Example 2: Debug mode authentication
 */
async function debugAuthExample() {
  console.log('🏦 Example 2: Debug Mode Authentication');
  
  const config: BanescoAuthConfig = {
    headless: false,  // Show browser
    debug: true,      // Enable debug pauses
    timeout: 120000   // Longer timeout for debugging
  };
  
  const auth = new BanescoAuth(exampleCredentials, config);
  
  try {
    console.log('🐛 Debug mode enabled - browser will pause at key points');
    
    const result = await auth.login();
    
    if (result.success) {
      console.log('🎉 Debug authentication successful!');
      
      // Take screenshot for debugging
      const page = auth.getPage();
      if (page) {
        await page.screenshot({ 
          path: 'banesco-debug-authenticated.png',
          fullPage: true 
        });
        console.log('📸 Debug screenshot saved');
      }
    }
    
  } catch (error) {
    console.error('💥 Debug error:', error);
  } finally {
    await auth.close();
  }
}

/**
 * Example 3: Authentication with retry logic
 */
async function retryAuthExample() {
  console.log('🏦 Example 3: Authentication with Retry Logic');
  
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Attempt ${attempt}/${maxRetries}`);
    
    const auth = new BanescoAuth(exampleCredentials, {
      headless: true,
      timeout: 30000 + (attempt * 10000), // Increase timeout with each retry
      saveSession: true
    });

    try {
      const result = await auth.login();
      
      if (result.success) {
        console.log(`✅ Success on attempt ${attempt}`);
        
        // Use authenticated session
        const page = auth.getPage();
        if (page) {
          console.log('🏦 Ready for banking operations');
          
          // Example: Check if on dashboard
          try {
            await page.waitForSelector('[id*="menu"], .dashboard', { timeout: 5000 });
            console.log('📊 Dashboard detected');
          } catch (e) {
            console.log('⚠️  Dashboard not detected, but login successful');
          }
        }
        
        await auth.close();
        return true; // Success
      } else {
        console.log(`❌ Attempt ${attempt} failed:`, result.message);
        await auth.close();
        
        if (attempt < maxRetries) {
          console.log('⏳ Waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
    } catch (error) {
      console.error(`💥 Attempt ${attempt} error:`, error);
      await auth.close();
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  console.error(`❌ All ${maxRetries} attempts failed`);
  return false;
}

/**
 * Example 4: Error handling scenarios
 */
async function errorHandlingExample() {
  console.log('🏦 Example 4: Error Handling Scenarios');
  
  const auth = new BanescoAuth(exampleCredentials);
  
  try {
    const result = await auth.login();
    
    if (!result.success) {
      console.log('❌ Authentication failed:', result.message);
      
      // Handle specific error scenarios
      if (result.message.includes('security questions')) {
        console.log('💡 Tip: Check your security questions configuration');
        console.log('Format: "keyword1:answer1,keyword2:answer2"');
        console.log('Example: "madre:maria,colegio:central,mascota:firulais"');
      } else if (result.message.includes('timeout')) {
        console.log('💡 Tip: Try increasing timeout or check internet connection');
      } else if (result.message.includes('System')) {
        console.log('💡 Tip: Banesco system might be temporarily unavailable');
      } else if (result.message.includes('iframe')) {
        console.log('💡 Tip: Login page structure might have changed');
      }
      
      // Get log content for debugging
      const logContent = auth.getLogContent();
      console.log('📄 Last 10 log lines:');
      const lines = logContent.split('\n').slice(-10);
      lines.forEach((line: string) => console.log(`  ${line}`));
      
      // Export logs
      auth.exportLogs(`banesco-error-${Date.now()}.log`);
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
  } finally {
    await auth.close();
  }
}

/**
 * Example 5: Production configuration
 */
async function productionExample() {
  console.log('🏦 Example 5: Production Configuration');
  
  const productionConfig: BanescoAuthConfig = {
    headless: true,        // Always headless in production
    timeout: 60000,        // Longer timeout for production
    saveSession: true,     // Enable session persistence  
    debug: false          // No debug in production
  };
  
  const auth = new BanescoAuth({
    username: process.env.BANESCO_USERNAME!,
    password: process.env.BANESCO_PASSWORD!,
    securityQuestions: process.env.BANESCO_SECURITY_QUESTIONS!
  }, productionConfig);
  
  try {
    console.log('🚀 Starting production authentication...');
    
    const result = await auth.login();
    
    if (result.success) {
      console.log('✅ Production authentication successful');
      
      // Log success without sensitive data
      console.log(`User ${auth.getCredentials().username.substring(0, 3)}*** authenticated`);
      
      // Perform banking operations...
      const page = auth.getPage();
      if (page) {
        // Production banking operations here
        console.log('🏦 Ready for production banking operations');
      }
      
    } else {
      // Log failure without sensitive data
      console.error('❌ Production authentication failed');
      console.error('Reason:', result.message);
      
      // Export error logs with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      auth.exportLogs(`production-error-${timestamp}.log`);
    }
    
  } catch (error) {
    console.error('💥 Production error:', error);
  } finally {
    await auth.close();
  }
}

/**
 * Run specific example
 */
async function runExample(exampleName: string) {
  console.log(`🚀 Running ${exampleName} example...\n`);
  
  switch (exampleName) {
    case 'basic':
      await basicAuthExample();
      break;
    case 'debug':
      await debugAuthExample();
      break;
    case 'retry':
      await retryAuthExample();
      break;
    case 'error':
      await errorHandlingExample();
      break;
    case 'production':
      await productionExample();
      break;
    default:
      console.log('Available examples: basic, debug, retry, error, production');
  }
}

/**
 * Main execution
 */
if (require.main === module) {
  const exampleName = process.argv[2] || 'basic';
  
  console.log(`
🏦 Banesco Authentication Examples
===================================

Usage: npx ts-node examples/basic-usage.ts [example]

Available examples:
- basic: Simple authentication
- debug: Debug mode with browser visible
- retry: Authentication with retry logic  
- error: Error handling scenarios
- production: Production-ready configuration

Environment variables needed:
- BANESCO_USERNAME: Your Banesco username
- BANESCO_PASSWORD: Your Banesco password
- BANESCO_SECURITY_QUESTIONS: Security questions (format: "madre:maria,colegio:central")
  `);
  
  runExample(exampleName).catch(console.error);
}

// Export for use in other files
export {
  basicAuthExample,
  debugAuthExample,
  retryAuthExample,
  errorHandlingExample,
  productionExample,
  runExample
}; 