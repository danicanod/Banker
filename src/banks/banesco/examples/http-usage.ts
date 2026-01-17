/**
 * Banesco HTTP Client Example
 * 
 * Demonstrates the pure HTTP-based login (no browser required).
 * This is ~10x faster than the Playwright-based approach.
 * 
 * Usage:
 *   1. Set credentials in .env file
 *   2. Run: npm run example:banesco-http
 */

import 'dotenv/config';
import { BanescoHttpClient } from '../http/index.js';

async function main() {
  console.log('═'.repeat(60));
  console.log('🚀 Banesco HTTP Client Example');
  console.log('═'.repeat(60));
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

  console.log(`📋 Credentials:`);
  console.log(`   Username: ${username.substring(0, 3)}***`);
  console.log(`   Password: ${'*'.repeat(8)}`);
  console.log(`   Security Questions: ${securityQuestions ? 'configured' : 'not configured'}`);
  console.log('');

  // Create HTTP client
  const client = new BanescoHttpClient(
    {
      username,
      password,
      securityQuestions: securityQuestions || ''
    },
    {
      debug: true,  // Enable logging
      timeout: 30000
    }
  );

  // Measure login time
  console.log('─'.repeat(60));
  const startTime = Date.now();

  // Perform login
  const result = await client.login();

  const elapsed = Date.now() - startTime;
  console.log('─'.repeat(60));
  console.log('');

  // Report results
  if (result.success) {
    console.log('✅ LOGIN SUCCESSFUL');
    console.log(`   Time: ${elapsed}ms`);
    console.log(`   Dashboard URL: ${result.dashboardUrl}`);
    console.log(`   Cookies: ${result.cookies?.size || 0} stored`);
    
    // Try to get transactions
    console.log('');
    console.log('─'.repeat(60));
    console.log('📊 Attempting to fetch transactions...');
    
    const transactions = await client.getTransactions();
    
    if (transactions.success) {
      console.log(`   Found ${transactions.transactions.length} transactions`);
      
      if (transactions.transactions.length > 0) {
        console.log('');
        console.log('   Sample transactions:');
        transactions.transactions.slice(0, 5).forEach((tx, i) => {
          console.log(`   ${i + 1}. ${tx.date} | ${tx.type.padEnd(6)} | ${tx.amount.toFixed(2).padStart(12)} | ${tx.description.substring(0, 30)}`);
        });
      }
    } else {
      console.log(`   ⚠️  ${transactions.message}`);
    }
    
  } else {
    console.log('❌ LOGIN FAILED');
    console.log(`   Error: ${result.error}`);
    console.log(`   Message: ${result.message}`);
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log(`⏱️  Total time: ${Date.now() - startTime}ms`);
  console.log('═'.repeat(60));
}

// Run
main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
