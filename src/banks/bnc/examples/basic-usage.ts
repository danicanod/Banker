/**
 * BNC Scraper Usage Examples
 * 
 * This file demonstrates how to use the modern BNC scraper with various
 * configurations and scenarios including 3-step authentication and multi-account support.
 */

import { config } from 'dotenv';
config(); // Load .env file

import { BncAuth } from '../auth/bnc-auth.js';
import type { BncCredentials, BncAuthConfig } from '../types/index.js';

// Load credentials from environment
const exampleCredentials: BncCredentials = {
  id: process.env.BNC_ID || '',
  card: process.env.BNC_CARD || '',
  password: process.env.BNC_PASSWORD || ''
};

// Validate credentials are present
if (!exampleCredentials.id || !exampleCredentials.card || !exampleCredentials.password) {
  console.error('❌ Missing credentials. Set these environment variables in .env:');
  console.error('   BNC_ID=your_cedula');
  console.error('   BNC_CARD=your_card_number');
  console.error('   BNC_PASSWORD=your_password');
  process.exit(1);
}

/**
 * Example 1: Basic authentication
 */
async function basicAuthExample() {
  console.log('🏦 Example 1: Basic BNC Authentication');
  
  const auth = new BncAuth(exampleCredentials);
  
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
  
  const config: BncAuthConfig = {
    headless: false,  // Show browser
    debug: true,      // Enable debug pauses
    timeout: 120000,  // Longer timeout for debugging
    retries: 1        // Single attempt for debugging
  };
  
  const auth = new BncAuth(exampleCredentials, config);
  
  try {
    console.log('🐛 Debug mode enabled - browser will pause at key points');
    
    const result = await auth.login();
    
    if (result.success) {
      console.log('🎉 Debug authentication successful!');
      
      // Take screenshot for debugging
      const page = auth.getPage();
      if (page) {
        await page.screenshot({ 
          path: 'bnc-debug-authenticated.png',
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
  
  const config: BncAuthConfig = {
    headless: true,
    timeout: 45000,
    retries: 3,      // Allow 3 attempts
    saveSession: true
  };
  
  const auth = new BncAuth(exampleCredentials, config);

  try {
    const result = await auth.login();
    
    if (result.success) {
      console.log('✅ Authentication successful with retry logic!');
      
      // Use authenticated session
      const page = auth.getPage();
      if (page) {
        console.log('🏦 Ready for banking operations');
        
        // Example: Check if on dashboard
        try {
          await page.waitForSelector('[class*="dashboard"], [id*="menu"]', { timeout: 5000 });
          console.log('📊 Dashboard detected');
        } catch (e) {
          console.log('⚠️  Dashboard not detected, but login successful');
        }
      }
    } else {
      console.log('❌ All retry attempts failed:', result.message);
    }
    
  } catch (error) {
    console.error('💥 Retry error:', error);
  } finally {
    await auth.close();
  }
}

/**
 * Example 4: Error handling scenarios
 */
async function errorHandlingExample() {
  console.log('🏦 Example 4: Error Handling Scenarios');
  
  const auth = new BncAuth(exampleCredentials);
  
  try {
    const result = await auth.login();
    
    if (!result.success) {
      console.log('❌ Authentication failed:', result.message);
      
      // Handle specific error scenarios
      if (result.message.includes('timeout')) {
        console.log('💡 Tip: Try increasing timeout or check internet connection');
      } else if (result.message.includes('Card')) {
        console.log('💡 Tip: Verify your card number is correct');
      } else if (result.message.includes('ID')) {
        console.log('💡 Tip: Verify your user ID (cédula) is correct');
      } else if (result.message.includes('password')) {
        console.log('💡 Tip: Verify your password is correct');
      } else if (result.message.includes('Max retries')) {
        console.log('💡 Tip: BNC might be experiencing issues, try again later');
      }
      
      // Get log content for debugging
      const logContent = auth.getLogContent();
      console.log('📄 Last 10 log lines:');
      const lines = logContent.split('\n').slice(-10);
      lines.forEach((line: string) => console.log(`  ${line}`));
      
      // Export logs
      auth.exportLogs(`bnc-error-${Date.now()}.log`);
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
  
  const productionConfig: BncAuthConfig = {
    headless: true,        // Always headless in production
    timeout: 60000,        // Longer timeout for production
    retries: 2,           // Limited retries in production
    saveSession: true,     // Enable session persistence  
    debug: false          // No debug in production
  };
  
  const auth = new BncAuth({
    id: process.env.BNC_ID!,
    card: process.env.BNC_CARD!,
    password: process.env.BNC_PASSWORD!
  }, productionConfig);
  
  try {
    console.log('🚀 Starting production authentication...');
    
    const result = await auth.login();
    
    if (result.success) {
      console.log('✅ Production authentication successful');
      
      // Log success without sensitive data
      console.log(`User ${auth.getCredentials().id.substring(0, 3)}*** authenticated`);
      
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
// ESM-compatible main check
const isMain = import.meta.url === `file://${process.argv[1]}` || 
               import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, '/') || '');

if (isMain) {
  const exampleName = process.argv[2] || 'basic';
  
  console.log(`
🏦 BNC Authentication Examples
==============================

Usage: npx ts-node examples/basic-usage.ts [example]

Available examples:
- basic: Simple 3-step authentication
- debug: Debug mode with browser visible
- retry: Authentication with retry logic  
- error: Error handling scenarios
- production: Production-ready configuration

Environment variables needed:
- BNC_ID: Your cédula de identidad
- BNC_CARD: Your BNC card number
- BNC_PASSWORD: Your BNC password
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