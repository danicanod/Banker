/**
 * BNC HTTP Usage Example
 *
 * Demonstrates how to use the BNC client for fast
 * transaction fetching with pure HTTP (no browser overhead).
 *
 * Run with: npm run example:bnc
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
  createBncClient,
  createBncHttpClient,
  quickHttpScrape,
} from '../index.js';

// ============================================================================
// Configuration
// ============================================================================

function getCredentials() {
  const cardNumber = process.env.BNC_CARD;
  const id = process.env.BNC_ID;
  const password = process.env.BNC_PASSWORD;

  if (!cardNumber || !id || !password) {
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

  return { cardNumber, id, password };
}

// ============================================================================
// Example 1: Quick HTTP Scrape (simplest approach)
// ============================================================================

async function exampleQuickScrape() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 1: Quick HTTP Scrape');
  console.log('='.repeat(60) + '\n');

  const { cardNumber, id, password } = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  console.log('🚀 Running quick HTTP scrape...');
  const startTime = Date.now();

  const result = await quickHttpScrape(
    { card: cardNumber, id, password },
    { debug }
  );

  const elapsed = Date.now() - startTime;
  console.log(`\n⏱️  Completed in ${elapsed}ms`);

  if (result.success) {
    console.log(`✅ Success: ${result.data?.length || 0} transactions found`);

    // Show sample transactions
    if (result.data && result.data.length > 0) {
      console.log('\n📊 Sample transactions:');
      result.data.slice(0, 5).forEach((tx, i) => {
        console.log(
          `   ${i + 1}. ${tx.date} | ${tx.type.toUpperCase().padEnd(6)} | ${String(tx.amount).padStart(12)} | ${tx.description.substring(0, 30)}`
        );
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

  const { cardNumber, id, password } = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  // Create client
  console.log('📡 Creating HTTP client...');
  const client = createBncHttpClient(
    { card: cardNumber, id, password },
    { debug, timeout: 30000 }
  );

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
// Example 3: Using BncClient (recommended)
// ============================================================================

async function exampleClientUsage() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 3: BncClient (Recommended)');
  console.log('='.repeat(60) + '\n');

  const { cardNumber, id, password } = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  // Create client
  console.log('📡 Creating BNC client...');
  const client = createBncClient(
    { cardNumber, id, password },
    { debug }
  );

  // Login
  console.log('🔐 Logging in...');
  const loginResult = await client.login();

  if (!loginResult.success) {
    console.log(`❌ Login failed: ${loginResult.message}`);
    return null;
  }

  console.log('✅ Login successful');

  // Fetch transactions
  console.log('📊 Fetching transactions...');
  const result = await client.getTransactions();

  console.log(`\n📊 Results:`);
  console.log(`   Success: ${result.success}`);
  console.log(`   Transactions: ${result.data?.length || 0}`);

  // Show sample transactions
  if (result.data && result.data.length > 0) {
    console.log('\n📋 Sample transactions:');
    result.data.slice(0, 5).forEach((tx, i) => {
      console.log(
        `   ${i + 1}. ${tx.date} | ${tx.type.toUpperCase().padEnd(6)} | ${String(tx.amount).padStart(12)} | ${tx.description.substring(0, 30)}`
      );
    });
  }

  // Clean up
  await client.close();

  return result;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🏦 BNC HTTP Usage Examples');
  console.log('==========================\n');

  // Example 1: Quick scrape (default)
  await exampleQuickScrape();

  // Example 2: Step-by-step (uncomment to run)
  // await exampleStepByStep();

  // Example 3: BncClient (uncomment to run)
  // await exampleClientUsage();

  console.log('\n✅ Examples completed!');
}

// Run if executed directly
main().catch(console.error);
