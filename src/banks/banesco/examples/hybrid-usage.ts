/**
 * Banesco Hybrid Usage Example
 *
 * Demonstrates the hybrid approach:
 * - Playwright for login (handles JS, iframes, security questions)
 * - HTTP for data fetching (faster, more stable)
 *
 * This is what BanescoClient does internally, shown step-by-step.
 *
 * Run with: npm run example:banesco-hybrid
 * Or: tsx src/banks/banesco/examples/hybrid-usage.ts
 */

import { config } from 'dotenv';
config();

import { BanescoAuth } from '../auth/banesco-auth.js';
import { BanescoHttpClient } from '../http/banesco-http-client.js';

// ============================================================================
// Configuration
// ============================================================================

function getCredentials() {
  const username = process.env.BANESCO_USERNAME;
  const password = process.env.BANESCO_PASSWORD;
  const securityQuestions = process.env.BANESCO_SECURITY_QUESTIONS;

  if (!username || !password || !securityQuestions) {
    console.error('❌ Missing credentials. Set environment variables:');
    console.error('   BANESCO_USERNAME, BANESCO_PASSWORD, BANESCO_SECURITY_QUESTIONS');
    process.exit(1);
  }

  return { username, password, securityQuestions };
}

// ============================================================================
// Hybrid Flow (step-by-step)
// ============================================================================

async function main() {
  console.log('🏦 Banesco Hybrid Usage Example');
  console.log('================================\n');

  const credentials = getCredentials();
  const debug = process.env.BANESCO_DEBUG === 'true';

  let auth: BanescoAuth | null = null;

  try {
    // =========================================================================
    // Step 1: Login with Playwright (handles JS, iframes, security questions)
    // =========================================================================
    console.log('🔐 Step 1: Login with Playwright...');

    auth = new BanescoAuth(credentials, {
      headless: true,
      timeout: 60000,
    });

    const loginResult = await auth.login();

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.message}`);
    }

    console.log('✅ Login successful\n');

    // =========================================================================
    // Step 2: Extract cookies from Playwright session
    // =========================================================================
    console.log('🍪 Step 2: Extracting session cookies...');

    const page = auth.getPage();
    if (!page) throw new Error('No page after login');

    const playwrightCookies = await page.context().cookies();
    console.log(`   Extracted ${playwrightCookies.length} cookies\n`);

    // =========================================================================
    // Step 3: Create HTTP client with Playwright cookies
    // =========================================================================
    console.log('📡 Step 3: Creating HTTP client with cookies...');

    const httpClient = new BanescoHttpClient(credentials, {
      debug,
      timeout: 30000,
      skipLogin: true,
    });

    httpClient.importCookiesFromPlaywright(playwrightCookies);
    console.log('   Cookies imported\n');

    // =========================================================================
    // Step 4: Close Playwright (no longer needed)
    // =========================================================================
    console.log('🧹 Step 4: Closing Playwright browser...');
    await auth.close();
    auth = null;
    console.log('   Browser closed\n');

    // =========================================================================
    // Step 5: Fetch data via HTTP (faster, more stable)
    // =========================================================================
    console.log('📊 Step 5: Fetching data via HTTP...\n');

    // Get accounts
    console.log('   Fetching accounts...');
    const accountsResult = await httpClient.getAccounts();

    if (accountsResult.success && accountsResult.accounts.length > 0) {
      console.log(`   ✅ Found ${accountsResult.accounts.length} account(s):`);
      for (const account of accountsResult.accounts) {
        console.log(`      - ${account.type}: ${account.accountNumber} (${account.currency} ${account.balance.toLocaleString()})`);
      }
      console.log('');

      // Get movements for first account
      const firstAccount = accountsResult.accounts[0];
      console.log(`   Fetching movements for ${firstAccount.accountNumber}...`);

      const movementsResult = await httpClient.getAccountMovements(firstAccount.accountNumber);

      if (movementsResult.success) {
        console.log(`   ✅ Found ${movementsResult.transactions.length} transactions`);

        // Show sample
        if (movementsResult.transactions.length > 0) {
          console.log('\n   Sample transactions:');
          movementsResult.transactions.slice(0, 3).forEach((tx, i) => {
            const icon = tx.type === 'credit' ? '📥' : '📤';
            console.log(`      ${i + 1}. ${tx.date} ${icon} ${tx.amount} | ${tx.description.substring(0, 30)}`);
          });
        }
      }
    }

    console.log('\n✅ Hybrid flow completed!');
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    if (auth) {
      await auth.close();
    }
  }
}

// Run
main().catch(console.error);
