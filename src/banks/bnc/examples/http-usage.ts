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

import { createBncClient } from '../index.js';

function getCredentials() {
  const cardNumber = process.env.BNC_CARD;
  const id = process.env.BNC_ID;
  const password = process.env.BNC_PASSWORD;

  if (!cardNumber || !id || !password) {
    console.error('Missing credentials. Set BNC_CARD, BNC_ID, BNC_PASSWORD');
    process.exit(1);
  }

  return { cardNumber, id, password };
}

async function main() {
  const { cardNumber, id, password } = getCredentials();
  const debug = process.env.BNC_DEBUG === 'true';

  const client = createBncClient({ cardNumber, id, password }, { debug });

  const loginResult = await client.login();
  if (!loginResult.success) {
    console.error(`Login failed: ${loginResult.message}`);
    process.exit(1);
  }

  const result = await client.getTransactions();
  console.log(`Found ${result.data?.length || 0} transactions`);

  if (result.data && result.data.length > 0) {
    result.data.slice(0, 5).forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.date} | ${tx.type} | ${tx.amount} | ${tx.description.substring(0, 30)}`);
    });
  }

  await client.close();
}

main().catch(console.error);
