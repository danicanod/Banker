/**
 * BNC HTTP Usage Example
 * 
 * Demonstrates how to use the pure HTTP-based BNC scraper for faster
 * transaction fetching without browser overhead.
 * 
 * Run with: npm run example:bnc-http
 * Or: tsx src/banks/bnc/examples/http-usage.ts
 * 
 * Environment variables:
 * - BNC_CARD: Your BNC card number
 * - BNC_ID: Your cédula (ID number)
 * - BNC_PASSWORD: Your BNC password
 * - BNC_DEBUG: Set to 'true' for verbose logging
 */

import { config } from 'dotenv';
config();

import { 
  createBncHttpClient, 
  quickHttpScrape,
  BncScraper,
  createBncScraper 
} from '../index.js';
import type { BncCredentials } from '../types/index.js';

// ============================================================================
// Configuration
// ============================================================================

function getCredentials(): BncCredentials {
  const card = process.env.BNC_CARD;
  const id = process.env.BNC_ID;
  const password = process.env.BNC_PASSWORD;

  if (!card || !id || !password) {
    console.error('❌ Missing credentials. Set these environment variables:');
    console.error('   BNC_CARD: Your BNC card number');
    console.error('   BNC_ID: Your cédula (ID number)');
    console.error('   BNC_PASSWORD: Your BNC password');
    console.error('');
    console.error('Example:');
    console.error('   export BNC_CARD="5410360143997535"');
    console.error('   export BNC_ID="27198516"');
    console.error('   export BNC_PASSWORD="YourPassword123"');
    process.exit(1);
  }

  return { card, id, password };
}

// ============================================================================
// Example 1: Quick HTTP Scrape (simplest approach)
// ============================================================================

async function exampleQuickScrape() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 1: Quick HTTP Scrape');
  console.log('='.repeat(60) + '\n');

  const credentials = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  console.log('🚀 Running quick HTTP scrape...');
  const startTime = Date.now();

  const result = await quickHttpScrape(credentials, { debug });

  const elapsed = Date.now() - startTime;
  console.log(`\n⏱️  Completed in ${elapsed}ms`);

  if (result.success) {
    console.log(`✅ Success: ${result.data?.length || 0} transactions found`);
    
    // Show sample transactions
    if (result.data && result.data.length > 0) {
      console.log('\n📊 Sample transactions:');
      result.data.slice(0, 5).forEach((tx, i) => {
        console.log(`   ${i + 1}. ${tx.date} | ${tx.type.toUpperCase().padEnd(6)} | ${tx.amount.toFixed(2).padStart(12)} | ${tx.description.substring(0, 30)}`);
      });
      
      if (result.data.length > 5) {
        console.log(`   ... and ${result.data.length - 5} more`);
      }
    }
  } else {
    console.log(`❌ Failed: ${result.error || result.message}`);
  }

  return result;
}

// ============================================================================
// Example 2: Step-by-step HTTP Client usage
// ============================================================================

async function exampleStepByStep() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 2: Step-by-step HTTP Client');
  console.log('='.repeat(60) + '\n');

  const credentials = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  // Create client
  console.log('📡 Creating HTTP client...');
  const client = createBncHttpClient(credentials, { 
    debug,
    timeout: 30000 
  });

  // Login
  console.log('🔐 Logging in...');
  const loginResult = await client.login();
  
  if (!loginResult.success) {
    console.log(`❌ Login failed: ${loginResult.error}`);
    return null;
  }
  
  console.log('✅ Login successful');

  // Fetch transactions
  console.log('📊 Fetching transactions...');
  const transactions = await client.fetchLast25Transactions();
  
  console.log(`✅ Fetched ${transactions.data?.length || 0} transactions`);
  
  // Clean up
  await client.reset();
  
  return transactions;
}

// ============================================================================
// Example 3: Using BncScraper with HTTP-first mode
// ============================================================================

async function exampleScraperWithHttpMode() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 3: BncScraper with HTTP-first mode');
  console.log('='.repeat(60) + '\n');

  const credentials = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  // Create scraper - HTTP mode is the default
  console.log('📡 Creating BNC scraper (HTTP-first mode)...');
  const scraper = createBncScraper(credentials, {
    debug,
    closeAfterScraping: true
    // forcePlaywright: false  // Default - uses HTTP first
    // disableFallback: false  // Default - falls back to Playwright if needed
  });

  // Run complete scraping session
  console.log('🚀 Running scraping session...');
  const session = await scraper.scrapeAll();

  console.log(`\n📊 Session Results:`);
  console.log(`   Method used: ${session.method || 'unknown'}`);
  console.log(`   Auth success: ${session.authResult.success}`);
  console.log(`   Transaction results: ${session.transactionResults.length}`);
  
  // Count total transactions
  const totalTransactions = session.transactionResults.reduce(
    (sum, result) => sum + (result.data?.length || 0),
    0
  );
  console.log(`   Total transactions: ${totalTransactions}`);

  return session;
}

// ============================================================================
// Example 4: Force Playwright mode (for comparison)
// ============================================================================

async function exampleForcePlaywright() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 4: Force Playwright mode');
  console.log('='.repeat(60) + '\n');

  const credentials = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  // Force Playwright mode
  console.log('🎭 Creating BNC scraper (Playwright mode forced)...');
  const scraper = createBncScraper(credentials, {
    debug,
    headless: true, // Run headless for example
    forcePlaywright: true,
    closeAfterScraping: true
  });

  // Run scraping
  console.log('🚀 Running Playwright-based scraping...');
  const startTime = Date.now();
  
  const session = await scraper.scrapeAll();
  
  const elapsed = Date.now() - startTime;
  console.log(`\n⏱️  Playwright mode completed in ${elapsed}ms`);
  console.log(`   Method used: ${session.method}`);

  return session;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🏦 BNC HTTP Usage Examples');
  console.log('==========================\n');

  // Example 1: Quick scrape
  await exampleQuickScrape();

  // Example 2: Step-by-step (uncomment to run)
  // await exampleStepByStep();

  // Example 3: Scraper with HTTP mode (uncomment to run)
  // await exampleScraperWithHttpMode();

  // Example 4: Force Playwright (uncomment to run - requires browser)
  // await exampleForcePlaywright();

  console.log('\n✅ Examples completed!');
}

// Run if executed directly
main().catch(console.error);
