/**
 * Performance Optimization Examples
 *
 * This file demonstrates how to use the clients effectively.
 *
 * Note: BNC uses pure HTTP (no browser), so it's already fast.
 * Banesco uses Playwright only for login, then HTTP for data.
 */

import { createBncClient } from '../banks/bnc/index.js';
import { createBanescoClient } from '../banks/banesco/index.js';

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
 * Example 1: BNC Client
 */
export async function exampleBncClient() {
  console.log('Example 1: BNC Client');

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
 * Example 2: Banesco Client
 */
export async function exampleBanescoClient() {
  console.log('Example 2: Banesco Client');

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

async function main() {
  await exampleBncClient();
  // await exampleBanescoClient();
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, '/') || '');

if (isMain) {
  main().catch(console.error);
}
