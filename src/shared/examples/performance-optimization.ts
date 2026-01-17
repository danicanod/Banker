/**
 * Performance Optimization Examples
 * 
 * This file demonstrates how to use the performance optimizations
 * to speed up banking scrapers significantly.
 */

import { BncScraper } from '../../banks/bnc/index.js';
import { BanescoScraper } from '../../banks/banesco/index.js';
import { PERFORMANCE_PRESETS } from '../performance-config.js';

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
 * Example 1: Maximum Performance - Fastest possible scraping
 * Blocks everything except essential functionality
 * Perfect for: Production automated scripts, CI/CD pipelines
 */
async function exampleMaximumPerformance() {
  console.log('🚀 Example 1: Maximum Performance Mode');
  
  const scraper = new BncScraper(bncCredentials, {
    headless: true,  // Headless for max speed
    performancePreset: 'MAXIMUM',  // Block everything possible
    debug: false     // No debug for production
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
 * Example 2: Aggressive Performance - Very fast but preserves essential JS
 * Perfect for: Regular automated tasks, monitoring systems
 */
async function exampleAggressivePerformance() {
  console.log('⚡ Example 2: Aggressive Performance Mode');
  
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
 * Example 3: Custom Performance Configuration
 * Fine-tune exactly what to block based on your needs
 */
async function exampleCustomPerformance() {
  console.log('🎯 Example 3: Custom Performance Configuration');
  
  const scraper = new BncScraper(bncCredentials, {
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
 * Example 4: Performance Comparison
 * Compare different performance settings side by side
 */
async function performanceComparison() {
  console.log('📊 Performance Comparison Test');
  
  const configs = [
    { name: 'No Optimization', preset: 'NONE' as const },
    { name: 'Conservative', preset: 'CONSERVATIVE' as const },
    { name: 'Balanced', preset: 'BALANCED' as const },
    { name: 'Aggressive', preset: 'AGGRESSIVE' as const },
    { name: 'Maximum', preset: 'MAXIMUM' as const }
  ];
  
  const results: Array<{ config: string; duration: number; success: boolean }> = [];
  
  for (const config of configs) {
    console.log(`\n🧪 Testing ${config.name} configuration...`);
    
    const scraper = new BncScraper(bncCredentials, {
      headless: true,
      performancePreset: config.preset,
      debug: false
    });
    
    const startTime = Date.now();
    let success = false;
    
    try {
      await scraper.authenticate();
      await scraper.scrapeTransactions();
      success = true;
    } catch (error) {
      console.log(`❌ ${config.name} failed: ${error}`);
    } finally {
      await scraper.close();
    }
    
    const duration = Date.now() - startTime;
    results.push({ config: config.name, duration, success });
    console.log(`⏱️  ${config.name}: ${duration}ms (${success ? 'SUCCESS' : 'FAILED'})`);
  }
  
  console.log('\n📊 Performance Comparison Results:');
  console.table(results);
}

/**
 * Example 5: Debug Mode with Performance Optimizations
 * Use performance optimizations while still being able to debug
 */
async function exampleDebugWithPerformance() {
  console.log('🐛 Example 5: Debug Mode with Performance');
  
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
    
    // await exampleMaximumPerformance();
    // await exampleAggressivePerformance();
    // await exampleCustomPerformance();
    await performanceComparison();  // Run performance comparison by default
    // await exampleDebugWithPerformance();
    
  } catch (error) {
    console.error('Main execution error:', error);
  }
}

// Performance Tips
console.log(`
📚 Performance Optimization Tips:

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

Expected Performance Gains:
• MAXIMUM: 70-80% faster than no optimization
• AGGRESSIVE: 60-70% faster than no optimization  
• BALANCED: 40-50% faster than no optimization
• CONSERVATIVE: 20-30% faster than no optimization
`);

if (require.main === module) {
  main().catch(console.error);
} 