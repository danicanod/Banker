/**
 * Banesco Hybrid Usage Example
 * 
 * Demonstrates the recommended "fast mode" approach for Banesco:
 * 1. Login with Playwright (required due to JS/iframe constraints)
 * 2. Export cookies from the authenticated session
 * 3. Use HTTP client for fast transaction fetching
 * 
 * This approach combines the reliability of browser-based login with
 * the speed of HTTP-based data fetching (~10x faster for data retrieval).
 * 
 * Usage:
 *   1. Set credentials in .env file
 *   2. Run: npm run example:banesco-hybrid
 */

import 'dotenv/config';
import { BanescoAuth } from '../auth/banesco-auth.js';
import { BanescoHttpClient } from '../http/index.js';
import type { BanescoCredentials } from '../types/index.js';

async function main() {
  console.log('═'.repeat(70));
  console.log('🚀 Banesco Hybrid Mode Example');
  console.log('   Playwright login → Cookie export → HTTP data fetch');
  console.log('═'.repeat(70));
  console.log('');

  // Get credentials from environment
  const username = process.env.BANESCO_USERNAME;
  const password = process.env.BANESCO_PASSWORD;
  const securityQuestions = process.env.BANESCO_SECURITY_QUESTIONS;

  if (!username || !password) {
    console.error('❌ Missing credentials. Please set in .env:');
    console.error('   BANESCO_USERNAME=your_username');
    console.error('   BANESCO_PASSWORD=your_password');
    console.error('   BANESCO_SECURITY_QUESTIONS=keyword1:answer1,keyword2:answer2');
    process.exit(1);
  }

  const credentials: BanescoCredentials = {
    username,
    password,
    securityQuestions: securityQuestions || ''
  };

  console.log('📋 Credentials:');
  console.log(`   Username: ${username.substring(0, 3)}***`);
  console.log(`   Password: ${'*'.repeat(8)}`);
  console.log(`   Security Questions: ${securityQuestions ? 'configured' : 'not configured'}`);
  console.log('');

  const overallStartTime = Date.now();
  let auth: BanescoAuth | null = null;

  try {
    // =========================================================================
    // PHASE 1: Playwright Login
    // =========================================================================
    console.log('─'.repeat(70));
    console.log('📍 PHASE 1: Playwright Authentication');
    console.log('─'.repeat(70));
    
    const loginStartTime = Date.now();
    
    auth = new BanescoAuth(credentials, {
      headless: process.env.HEADLESS === 'true',
      debug: process.env.DEBUG === 'true',
      timeout: 60000
    });

    console.log('🔐 Starting Playwright login...');
    const loginResult = await auth.login();
    
    const loginElapsed = Date.now() - loginStartTime;
    
    if (!loginResult.success) {
      console.error(`❌ Login failed: ${loginResult.message}`);
      process.exit(1);
    }

    console.log(`✅ Login successful in ${loginElapsed}ms`);
    console.log('');

    // =========================================================================
    // PHASE 2: Cookie Export
    // =========================================================================
    console.log('─'.repeat(70));
    console.log('📍 PHASE 2: Cookie Export');
    console.log('─'.repeat(70));
    
    const page = auth.getPage();
    if (!page) {
      throw new Error('No page available after login');
    }

    // Get cookies from the authenticated Playwright context
    const playwrightCookies = await page.context().cookies();
    
    console.log(`🍪 Extracted ${playwrightCookies.length} cookies from Playwright session`);
    
    // Log cookie names (not values for security)
    if (process.env.DEBUG === 'true') {
      console.log('   Cookie names:');
      playwrightCookies.forEach(c => {
        console.log(`      - ${c.name} (${c.domain})`);
      });
    }
    console.log('');

    // =========================================================================
    // PHASE 3: HTTP Data Fetch
    // =========================================================================
    console.log('─'.repeat(70));
    console.log('📍 PHASE 3: HTTP Transaction Fetch');
    console.log('─'.repeat(70));
    
    const httpStartTime = Date.now();

    // Create HTTP client with skip login mode
    const httpClient = new BanescoHttpClient(
      {
        username,
        password,
        securityQuestions: securityQuestions || ''
      },
      {
        debug: process.env.DEBUG === 'true',
        timeout: 30000,
        skipLogin: true  // We already have cookies from Playwright
      }
    );

    // Import cookies from Playwright
    httpClient.importCookiesFromPlaywright(playwrightCookies);
    
    // First, get list of accounts
    console.log('📋 Fetching accounts via HTTP...');
    const accountsResult = await httpClient.getAccounts();
    
    if (accountsResult.success && accountsResult.accounts.length > 0) {
      console.log(`✅ Found ${accountsResult.accounts.length} accounts:`);
      accountsResult.accounts.forEach((acc, i) => {
        const balanceStr = acc.balance.toFixed(2).padStart(15);
        console.log(`   ${i + 1}. ${acc.type.padEnd(25)} | ${acc.accountNumber} | ${balanceStr} ${acc.currency}`);
      });
      console.log('');
      
      // Get movements for the first account
      const primaryAccount = accountsResult.accounts[0];
      console.log(`📊 Fetching movements for: ${primaryAccount.accountNumber}...`);
      const movementsResult = await httpClient.getAccountMovements(primaryAccount.accountNumber);
      
      const httpElapsed = Date.now() - httpStartTime;
      
      console.log('');
      console.log('─'.repeat(70));
      console.log('📊 MOVEMENTS RESULTS');
      console.log('─'.repeat(70));
      
      if (movementsResult.success) {
        console.log(`✅ Movements fetch successful in ${httpElapsed}ms`);
        console.log(`   Message: ${movementsResult.message}`);
        console.log(`   Transactions found: ${movementsResult.transactions.length}`);
        
        if (movementsResult.transactions.length > 0) {
          console.log('');
          console.log('   Recent movements:');
          console.log('   ' + '─'.repeat(60));
          
          movementsResult.transactions.slice(0, 10).forEach((tx, i) => {
            const typeIcon = tx.type === 'debit' ? '📤' : '📥';
            const amountStr = tx.amount.toFixed(2).padStart(12);
            const desc = tx.description.substring(0, 30).padEnd(30);
            console.log(`   ${(i + 1).toString().padStart(2)}. ${tx.date || 'N/A'.padEnd(10)} | ${typeIcon} | ${amountStr} | ${desc}`);
          });
          
          if (movementsResult.transactions.length > 10) {
            console.log(`   ... and ${movementsResult.transactions.length - 10} more`);
          }
        }
      } else {
        console.log(`❌ Movements fetch failed: ${movementsResult.error}`);
        console.log(`   Message: ${movementsResult.message}`);
      }
    } else {
      console.log(`⚠️ No accounts found: ${accountsResult.message}`);
      
      // Fallback to basic transactions fetch
      console.log('📊 Falling back to basic transactions fetch...');
      const transactionResult = await httpClient.getTransactions();
      
      const httpElapsed = Date.now() - httpStartTime;
      
      console.log('');
      console.log('─'.repeat(70));
      console.log('📊 RESULTS');
      console.log('─'.repeat(70));
      
      if (transactionResult.success) {
        console.log(`✅ Transaction fetch successful in ${httpElapsed}ms`);
        console.log(`   Message: ${transactionResult.message}`);
        console.log(`   Transactions found: ${transactionResult.transactions.length}`);
      } else {
        console.log(`❌ Transaction fetch failed: ${transactionResult.error}`);
      }
    }

    // =========================================================================
    // Summary
    // =========================================================================
    const totalElapsed = Date.now() - overallStartTime;
    const httpElapsedTotal = Date.now() - httpStartTime;
    
    console.log('');
    console.log('═'.repeat(70));
    console.log('⏱️  TIMING SUMMARY');
    console.log('═'.repeat(70));
    console.log(`   Playwright login:     ${loginElapsed.toString().padStart(6)}ms`);
    console.log(`   HTTP data fetch:      ${httpElapsedTotal.toString().padStart(6)}ms`);
    console.log(`   ─────────────────────────────`);
    console.log(`   Total time:           ${totalElapsed.toString().padStart(6)}ms`);
    console.log('');
    console.log('💡 TIP: In production, you can cache the session cookies and');
    console.log('   skip Playwright entirely for subsequent requests until');
    console.log('   the session expires.');
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('');
    console.error('💥 Fatal error:', error);
    process.exit(1);
    
  } finally {
    // Clean up Playwright resources
    if (auth) {
      console.log('');
      console.log('🧹 Cleaning up Playwright session...');
      await auth.close();
      console.log('✅ Cleanup complete');
    }
  }
}

// Run
main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
