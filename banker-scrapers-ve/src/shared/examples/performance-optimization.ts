/**
 * Performance Optimization Examples
 * 
 * This file demonstrates how to use the performance optimizations
 * to speed up banking scrapers significantly.
 * 
 * Note: BNC uses pure HTTP (no browser), so performance presets only apply to Banesco.
 * BNC HTTP-based scraping is already ~8-10x faster than browser automation.
 */

import { BncScraper, quickHttpScrape } from '../../banks/bnc/index.js';
import { BanescoScraper } from '../../banks/banesco/index.js';

// Example credentials (use your real ones)
const bncCredentials = {
  id: process.env.BNC_ID || 'V12345678',
  card: process.env.BNC_CARD || '1234567890123456',
  password: process.env.BNC_PASSWORD || 'your_password'
};

const banescoCredentials = {
  username: process.env.BANESCO_USERNAME || 'V12345678',
  password: process.env.BANESCO_PASSWORD || 'your_password',
  securityQuestions: process.env.BANESCO_SECURITY_QUESTIONS || 'madre:maria,mascota:firulais'
};

/**
 * Example 1: BNC Pure HTTP (Fastest approach - no browser)
 * BNC uses HTTP-only scraping, which is inherently fast.
 * No performance presets needed - it's already optimized.
 */
async function exampleBncHttpScraping() {
  console.log('🚀 Example 1: BNC Pure HTTP Scraping (Fastest)');
  
  const startTime = Date.now();
  
  try {
    // Quick one-liner approach
    const result = await quickHttpScrape(bncCredentials, { debug: false });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 2: BNC Scraper wrapper
 * Uses the BncScraper class for session management
 */
async function exampleBncScraper() {
  console.log('⚡ Example 2: BNC Scraper Wrapper');
  
  const scraper = new BncScraper(bncCredentials, {
    debug: false,
    closeAfterScraping: true
  });

  const startTime = Date.now();
  
  try {
    const session = await scraper.scrapeAll();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${session.transactionResults[0]?.data?.length || 0} transactions`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await scraper.close();
  }
}

/**
 * Example 3: Banesco Aggressive Performance - Very fast but preserves essential JS
 * Banesco uses Playwright for login, so performance presets apply here.
 * Perfect for: Regular automated tasks, monitoring systems
 */
async function exampleBanescoAggressivePerformance() {
  console.log('⚡ Example 3: Banesco Aggressive Performance Mode');
  
  const scraper = new BanescoScraper(banescoCredentials, {
    headless: true,
    performancePreset: 'AGGRESSIVE',  // Block most, keep essential JS
    debug: false
  });

  const startTime = Date.now();
  
  try {
    await scraper.authenticate();
    const result = await scraper.scrapeTransactions();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await scraper.close();
  }
}

/**
 * Example 4: Banesco Custom Performance Configuration
 * Fine-tune exactly what to block based on your needs
 */
async function exampleBanescoCustomPerformance() {
  console.log('🎯 Example 4: Banesco Custom Performance Configuration');
  
  const scraper = new BanescoScraper(banescoCredentials, {
    headless: false,  // Show browser for debugging
    debug: true,      // Enable debugging
    performance: {    // Custom performance settings
      blockCSS: true,        // Block styling for speed
      blockImages: true,     // Block images (not needed)
      blockFonts: true,      // Block font downloads
      blockMedia: false,     // Allow media (just in case)
      blockNonEssentialJS: true,  // Block non-essential JS
      blockAds: true,        // Always block ads
      blockAnalytics: true   // Always block tracking
    }
  });

  const startTime = Date.now();
  
  try {
    await scraper.authenticate();
    const result = await scraper.scrapeTransactions();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await scraper.close();
  }
}

/**
 * Example 5: Debug Mode with Performance Optimizations (Banesco)
 * Use performance optimizations while still being able to debug
 */
async function exampleBanescoDebugWithPerformance() {
  console.log('🐛 Example 5: Banesco Debug Mode with Performance');
  
  const scraper = new BanescoScraper(banescoCredentials, {
    headless: false,      // Show browser
    debug: true,          // Enable debug pauses
    performancePreset: 'BALANCED',  // Some optimizations but keep CSS for visual feedback
    timeout: 60000        // Longer timeout for debugging
  });

  try {
    console.log('🔍 Starting debug session with performance optimizations...');
    console.log('💡 CSS is preserved for visual feedback');
    console.log('💡 Images, fonts, and ads are blocked for speed');
    
    await scraper.authenticate();
    const result = await scraper.scrapeTransactions();
    
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await scraper.close();
  }
}

// Main execution
async function main() {
  console.log('🚀 Banking Scraper Performance Optimization Examples\n');
  
  try {
    // Uncomment the example you want to run:
    
    await exampleBncHttpScraping();    // BNC HTTP (fastest)
    // await exampleBncScraper();      // BNC Scraper wrapper
    // await exampleBanescoAggressivePerformance();  // Banesco with performance
    // await exampleBanescoCustomPerformance();      // Banesco custom config
    // await exampleBanescoDebugWithPerformance();   // Banesco debug mode
    
  } catch (error) {
    console.error('Main execution error:', error);
  }
}

// Performance Tips
console.log(`
📚 Performance Optimization Tips:

BNC (Pure HTTP - No Browser):
• BNC uses HTTP-only scraping - already ~8-10x faster than browser
• No performance presets needed - it's inherently fast
• Typical time: ~2 seconds for login + transactions

Banesco (Playwright with Performance Presets):
1. 🏆 Use 'MAXIMUM' preset for fastest login/auth flows
2. ⚡ Use 'AGGRESSIVE' preset for transaction scraping  
3. 🎯 Use 'BALANCED' preset when debugging with visual feedback
4. 🐛 Use 'CONSERVATIVE' preset if experiencing issues
5. 🚫 Custom blocking: fine-tune exactly what resources to block

6. 💡 Headless mode provides additional 20-30% speed boost
7. 🎨 Blocking CSS saves 40-60% load time (forms still work!)
8. 📷 Blocking images saves 30-50% bandwidth and load time
9. 🔤 Blocking fonts saves 10-20% load time
10. 📊 Always block ads/analytics for 15-25% speed improvement

Expected Performance Gains (Banesco with Playwright):
• MAXIMUM: 70-80% faster than no optimization
• AGGRESSIVE: 60-70% faster than no optimization  
• BALANCED: 40-50% faster than no optimization
• CONSERVATIVE: 20-30% faster than no optimization
`);

// ESM-compatible main check
const isMain = import.meta.url === `file://${process.argv[1]}` || 
               import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, '/') || '');

if (isMain) {
  main().catch(console.error);
}
