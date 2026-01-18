/**
 * Performance Optimization Examples
 *
 * This file demonstrates how to use the clients effectively.
 *
 * Note: BNC uses pure HTTP (no browser), so it's already fast.
 * Banesco uses Playwright only for login, then HTTP for data.
 */

import { createBncClient, quickHttpScrape } from '../../banks/bnc/index.js';
import { createBanescoClient } from '../../banks/banesco/index.js';

// Example credentials (use your real ones)
const bncCredentials = {
  id: process.env.BNC_ID || 'V12345678',
  cardNumber: process.env.BNC_CARD || '1234567890123456',
  password: process.env.BNC_PASSWORD || 'your_password',
};

const banescoCredentials = {
  username: process.env.BANESCO_USERNAME || 'V12345678',
  password: process.env.BANESCO_PASSWORD || 'your_password',
  securityQuestions:
    process.env.BANESCO_SECURITY_QUESTIONS || 'madre:maria,mascota:firulais',
};

/**
 * Example 1: BNC Pure HTTP (Fastest approach - no browser)
 * BNC uses HTTP-only, which is inherently fast.
 */
async function exampleBncHttpScraping() {
  console.log('🚀 Example 1: BNC Pure HTTP Scraping (Fastest)');

  const startTime = Date.now();

  try {
    // Quick one-liner approach
    const result = await quickHttpScrape(
      {
        id: bncCredentials.id,
        card: bncCredentials.cardNumber,
        password: bncCredentials.password,
      },
      { debug: false }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 2: BNC Client wrapper
 * Uses the BncClient class for session management
 */
async function exampleBncClient() {
  console.log('⚡ Example 2: BNC Client');

  const client = createBncClient(bncCredentials, {
    debug: false,
  });

  const startTime = Date.now();

  try {
    await client.login();
    const result = await client.getTransactions();

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`📊 Found ${result.data?.length || 0} transactions`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

/**
 * Example 3: Banesco Client (Hybrid: Playwright login + HTTP fetch)
 * Uses Playwright only for login, then HTTP for fast data fetching.
 */
async function exampleBanescoClient() {
  console.log('⚡ Example 3: Banesco Client (Hybrid Mode)');

  const client = createBanescoClient(banescoCredentials, {
    headless: true,
    debug: false,
  });

  const startTime = Date.now();

  try {
    console.log('🔐 Logging in (Playwright)...');
    const loginResult = await client.login();

    if (!loginResult.success) {
      console.log(`❌ Login failed: ${loginResult.message}`);
      return;
    }

    console.log('📊 Fetching accounts (HTTP)...');
    const accounts = await client.getAccounts();
    console.log(`   Found ${accounts.accounts.length} accounts`);

    if (accounts.accounts.length > 0) {
      console.log('📊 Fetching movements (HTTP)...');
      const movements = await client.getAccountMovements(
        accounts.accounts[0].accountNumber
      );
      console.log(`   Found ${movements.transactions.length} transactions`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Completed in ${duration}ms`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

// Main execution
async function main() {
  console.log('🚀 Banking Client Performance Examples\n');

  try {
    // Uncomment the example you want to run:

    await exampleBncHttpScraping(); // BNC HTTP (fastest)
    // await exampleBncClient();      // BNC Client wrapper
    // await exampleBanescoClient();  // Banesco hybrid mode
  } catch (error) {
    console.error('Main execution error:', error);
  }
}

// Performance Tips
console.log(`
📚 Performance Tips:

BNC (Pure HTTP - No Browser):
• Uses HTTP-only - already ~8-10x faster than browser
• Typical time: ~2 seconds for login + transactions

Banesco (Hybrid: Playwright login + HTTP data):
• Playwright handles login (JS, iframes, security questions)
• HTTP handles data fetching (faster, more stable)
• Typical time: ~15-20 seconds for login, ~2 seconds for data

General Tips:
1. Use headless mode for faster execution
2. Use debug: false in production
3. Close clients when done to free resources
`);

// ESM-compatible main check
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, '/') || '');

if (isMain) {
  main().catch(console.error);
}
