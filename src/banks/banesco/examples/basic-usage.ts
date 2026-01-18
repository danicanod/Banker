/**
 * Banesco Basic Usage Example
 *
 * Demonstrates how to use the BanescoClient for:
 * - Login (Playwright-based, handles security questions)
 * - Fetching accounts (HTTP-based)
 * - Fetching transactions (HTTP-based)
 *
 * Run with: npm run example:banesco
 * Or: tsx src/banks/banesco/examples/basic-usage.ts
 *
 * Environment variables:
 * - BANESCO_USERNAME: Your Banesco username (cedula)
 * - BANESCO_PASSWORD: Your Banesco password
 * - BANESCO_SECURITY_QUESTIONS: Security questions in format "keyword1:answer1,keyword2:answer2"
 */

import { config } from 'dotenv';
config();

import { createBanescoClient } from '../index.js';

// ============================================================================
// Configuration
// ============================================================================

function getCredentials() {
  const username = process.env.BANESCO_USERNAME;
  const password = process.env.BANESCO_PASSWORD;
  const securityQuestions = process.env.BANESCO_SECURITY_QUESTIONS;

  if (!username || !password || !securityQuestions) {
    console.error('❌ Missing credentials. Set these environment variables:');
    console.error('   BANESCO_USERNAME: Your Banesco username (cedula)');
    console.error('   BANESCO_PASSWORD: Your Banesco password');
    console.error('   BANESCO_SECURITY_QUESTIONS: keyword1:answer1,keyword2:answer2');
    console.error('');
    console.error('Example:');
    console.error('   export BANESCO_USERNAME="V12345678"');
    console.error('   export BANESCO_PASSWORD="YourPassword123"');
    console.error('   export BANESCO_SECURITY_QUESTIONS="mascota:Firulais,madre:Maria"');
    process.exit(1);
  }

  return { username, password, securityQuestions };
}

// ============================================================================
// Main Example
// ============================================================================

async function main() {
  console.log('🏦 Banesco Basic Usage Example');
  console.log('================================\n');

  const credentials = getCredentials();
  const debug = process.env.BANESCO_DEBUG === 'true';

  // Create client
  console.log('📡 Creating Banesco client...');
  const client = createBanescoClient(credentials, {
    headless: true,
    debug,
  });

  const startTime = Date.now();

  try {
    // Step 1: Login
    console.log('🔐 Logging in (Playwright - handles security questions)...');
    const loginResult = await client.login();

    if (!loginResult.success) {
      console.log(`❌ Login failed: ${loginResult.message}`);
      return;
    }

    console.log(`✅ Login successful (${loginResult.cookieCount} cookies extracted)`);

    // Step 2: Get accounts
    console.log('\n📋 Fetching accounts (HTTP)...');
    const accountsResult = await client.getAccounts();

    if (accountsResult.success && accountsResult.accounts.length > 0) {
      console.log(`✅ Found ${accountsResult.accounts.length} account(s):`);
      for (const account of accountsResult.accounts) {
        console.log(`   - ${account.type}: ${account.accountNumber}`);
        console.log(`     Balance: ${account.currency} ${account.balance.toLocaleString()}`);
      }
    } else {
      console.log('⚠️  No accounts found');
    }

    // Step 3: Get movements for first account
    if (accountsResult.accounts.length > 0) {
      const firstAccount = accountsResult.accounts[0];
      console.log(`\n📊 Fetching movements for ${firstAccount.accountNumber} (HTTP)...`);

      const movementsResult = await client.getAccountMovements(firstAccount.accountNumber);

      if (movementsResult.success && movementsResult.transactions.length > 0) {
        console.log(`✅ Found ${movementsResult.transactions.length} transactions:`);
        console.log('');

        // Show sample transactions
        movementsResult.transactions.slice(0, 5).forEach((tx, i) => {
          const icon = tx.type === 'credit' ? '📥' : '📤';
          console.log(
            `   ${i + 1}. ${tx.date} ${icon} ${String(tx.amount).padStart(12)} | ${tx.description.substring(0, 40)}`
          );
        });

        if (movementsResult.transactions.length > 5) {
          console.log(`   ... and ${movementsResult.transactions.length - 5} more`);
        }
      } else {
        console.log('⚠️  No transactions found');
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`\n⏱️  Total time: ${elapsed}ms`);
    console.log('✅ Example completed!');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n Error: ${message}`);
  } finally {
    await client.close();
  }
}

// Run
main().catch(console.error);
