/**
 * BNC Transaction Request Capture
 * 
 * This script uses Playwright to login and capture the EXACT POST request
 * that BNC's JavaScript makes to fetch transactions. The captured payload
 * will be used to fix the HTTP client.
 * 
 * Run: npx tsx src/banks/bnc/examples/capture-transaction-request.ts
 */

import 'dotenv/config';
import { chromium, Browser, Page, Request } from 'playwright';
import { writeFileSync } from 'fs';

// ============================================================================
// Configuration
// ============================================================================

const BNC_URLS = {
  LOGIN: 'https://personas.bncenlinea.com/',
  TRANSACTIONS: 'https://personas.bncenlinea.com/Accounts/Transactions/Last25',
  TRANSACTIONS_AJAX: '/Accounts/Transactions/Last25_List'
};

interface CapturedTransactionRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string | null;
  postDataParsed: Record<string, string> | null;
  timestamp: string;
}

// ============================================================================
// Main Capture Flow
// ============================================================================

async function main(): Promise<void> {
  const cardNumber = process.env.BNC_CARD;
  const userId = process.env.BNC_ID;
  const password = process.env.BNC_PASSWORD;

  if (!cardNumber || !userId || !password) {
    console.error('❌ Missing credentials. Set BNC_CARD, BNC_ID, BNC_PASSWORD in .env');
    process.exit(1);
  }

  console.log('═'.repeat(80));
  console.log('🎯 BNC Transaction Request Capture');
  console.log('═'.repeat(80));
  console.log(`Card: ${cardNumber.substring(0, 4)}****`);
  console.log(`User: ${userId.substring(0, 3)}***\n`);

  let browser: Browser | null = null;
  const capturedRequests: CapturedTransactionRequest[] = [];

  try {
    // Launch browser (visible for debugging)
    browser = await chromium.launch({
      headless: false,
      slowMo: 300
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-VE'
    });

    const page = await context.newPage();

    // ========================================================================
    // Set up request interception for the transaction AJAX endpoint
    // ========================================================================
    page.on('request', (request: Request) => {
      const url = request.url();
      
      // Capture ALL POST requests to understand the flow
      if (request.method() === 'POST') {
        const isTransactionRequest = url.includes('Last25_List') || 
                                      url.includes('Transactions') ||
                                      url.includes('Accounts');
        
        if (isTransactionRequest) {
          const postData = request.postData();
          
          console.log('\n' + '🎯'.repeat(40));
          console.log('🎯 CAPTURED TRANSACTION-RELATED POST REQUEST');
          console.log('🎯'.repeat(40));
          console.log(`URL: ${url}`);
          console.log(`Method: ${request.method()}`);
          console.log('\n📋 HEADERS:');
          const headers = request.headers();
          for (const [key, value] of Object.entries(headers)) {
            // Don't redact - we need to see everything
            console.log(`   ${key}: ${value}`);
          }
          
          console.log('\n📦 RAW POST DATA:');
          console.log(postData || '(empty)');
          
          // Parse form data
          if (postData) {
            console.log('\n📊 PARSED FORM FIELDS:');
            try {
              const params = new URLSearchParams(postData);
              const parsed: Record<string, string> = {};
              for (const [key, value] of params.entries()) {
                // Show full values (no truncation) for debugging
                console.log(`   ${key}: ${value.length > 100 ? value.substring(0, 100) + '...[' + value.length + ' chars]' : value}`);
                parsed[key] = value;
              }
              
              capturedRequests.push({
                url,
                method: request.method(),
                headers,
                postData,
                postDataParsed: parsed,
                timestamp: new Date().toISOString()
              });
            } catch (e) {
              console.log('   (Could not parse as form data)');
              console.log(`   Raw: ${postData.substring(0, 500)}`);
            }
          }
          console.log('🎯'.repeat(40) + '\n');
        }
      }
    });

    // Also capture responses
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('Last25_List')) {
        console.log('\n' + '📥'.repeat(40));
        console.log('📥 TRANSACTION AJAX RESPONSE');
        console.log('📥'.repeat(40));
        console.log(`Status: ${response.status()}`);
        console.log(`Headers: ${JSON.stringify(response.headers(), null, 2)}`);
        
        try {
          const body = await response.text();
          console.log(`\nResponse body (first 500 chars):`);
          console.log(body.substring(0, 500));
          
          // Try to parse as JSON
          try {
            const json = JSON.parse(body);
            console.log(`\nParsed JSON:`);
            console.log(`   Type: ${json.Type}`);
            console.log(`   Message: ${json.Message || 'null'}`);
            console.log(`   Value length: ${json.Value?.length || 0} chars`);
          } catch {
            console.log('   (Not JSON)');
          }
        } catch (e) {
          console.log(`Could not read body: ${e}`);
        }
        console.log('📥'.repeat(40) + '\n');
      }
    });

    // ========================================================================
    // Step 1: Login
    // ========================================================================
    console.log('📍 Step 1: Navigate to login page');
    await page.goto(BNC_URLS.LOGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('📍 Step 2: Enter credentials');
    await page.waitForSelector('#CardNumber', { timeout: 10000 });
    await page.fill('#CardNumber', cardNumber);
    await page.fill('#UserID', userId);
    await page.waitForTimeout(500);
    
    console.log('📍 Step 3: Submit first form');
    await page.click('button#BtnSend');
    
    console.log('📍 Step 4: Wait for password field');
    await page.waitForSelector('#UserPassword', { timeout: 20000 });
    
    console.log('📍 Step 5: Enter password');
    await page.fill('#UserPassword', password);
    await page.waitForTimeout(500);
    await page.click('button#BtnSend');
    
    console.log('📍 Step 6: Wait for dashboard');
    await page.waitForTimeout(5000);
    
    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('Welcome') && !currentUrl.includes('Home')) {
      console.log('⚠️  May not be authenticated, checking for error...');
      const content = await page.content();
      if (content.includes('sesión previa activa')) {
        console.log('❌ Session conflict - wait 5 minutes and try again');
        await browser.close();
        process.exit(1);
      }
    }
    
    console.log('✅ Login successful!\n');

    // ========================================================================
    // Step 2: Navigate to transactions page
    // ========================================================================
    console.log('📍 Step 7: Navigate to transactions page');
    await page.goto(BNC_URLS.TRANSACTIONS, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Save the HTML of the transactions page for analysis
    const pageHtml = await page.content();
    writeFileSync('debug-bnc-transactions-page.html', pageHtml);
    console.log('   📝 Saved page HTML to debug-bnc-transactions-page.html');

    // ========================================================================
    // Step 3: Find and interact with the filter/dropdown
    // ========================================================================
    console.log('\n📍 Step 8: Find account dropdown');
    
    // Look for the Bootstrap-Select dropdown
    const dropdownButton = page.locator('button.dropdown-toggle, .bootstrap-select button');
    
    if (await dropdownButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   ✅ Found dropdown button, clicking...');
      await dropdownButton.first().click();
      await page.waitForTimeout(1000);
      
      // Select an account option
      console.log('📍 Step 9: Select account option');
      const accountOption = page.locator('.dropdown-menu.inner li a, #bs-select-1-1');
      if (await accountOption.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await accountOption.first().click();
        await page.waitForTimeout(500);
        console.log('   ✅ Account selected');
      }
    } else {
      console.log('   ⚠️  Dropdown not visible, looking for form...');
      
      // Check if there's a select element we can interact with
      const selectElement = page.locator('select#ddlAccounts, select[name="ddlAccounts"]');
      if (await selectElement.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('   Found native select, selecting option...');
        await selectElement.first().selectOption({ index: 1 });
      }
    }

    // ========================================================================
    // Step 4: Click search/filter button to trigger AJAX
    // ========================================================================
    console.log('\n📍 Step 10: Click search button to trigger transaction fetch');
    
    // Look for various search button patterns
    const searchButtonPatterns = [
      'button:has-text("Buscar")',
      'button:has-text("Consultar")',
      'button[type="submit"]',
      '#btnSearch',
      'button.btn-primary'
    ];
    
    for (const pattern of searchButtonPatterns) {
      const btn = page.locator(pattern);
      if (await btn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`   Found button matching: ${pattern}`);
        console.log('   🔄 Clicking to trigger AJAX request...\n');
        await btn.first().click();
        break;
      }
    }
    
    // Wait for AJAX response
    console.log('⏳ Waiting for AJAX response...');
    await page.waitForTimeout(5000);

    // ========================================================================
    // Step 5: Check for transaction table
    // ========================================================================
    console.log('\n📍 Step 11: Check for transaction table');
    const tableLocator = page.locator('#Tbl_Transactions');
    
    if (await tableLocator.isVisible({ timeout: 5000 }).catch(() => false)) {
      const rows = await tableLocator.locator('tbody tr').count();
      console.log(`   ✅ Transaction table found with ${rows} rows`);
    } else {
      console.log('   ⚠️  Transaction table not visible');
    }

    // ========================================================================
    // Save captured requests
    // ========================================================================
    console.log('\n' + '═'.repeat(80));
    console.log('📊 CAPTURE SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Captured ${capturedRequests.length} transaction-related POST requests`);
    
    if (capturedRequests.length > 0) {
      const outputFile = `bnc-transaction-request-capture-${Date.now()}.json`;
      writeFileSync(outputFile, JSON.stringify(capturedRequests, null, 2));
      console.log(`\n💾 Saved to: ${outputFile}`);
      
      // Print the key request for HTTP client implementation
      const last25Request = capturedRequests.find(r => r.url.includes('Last25_List'));
      if (last25Request) {
        console.log('\n🎯 KEY REQUEST FOR HTTP CLIENT:');
        console.log('URL:', last25Request.url);
        console.log('\nRequired Headers:');
        const importantHeaders = ['content-type', 'x-requested-with', 'accept', 'referer'];
        for (const h of importantHeaders) {
          if (last25Request.headers[h]) {
            console.log(`   ${h}: ${last25Request.headers[h]}`);
          }
        }
        console.log('\nForm Fields:');
        if (last25Request.postDataParsed) {
          for (const [key, value] of Object.entries(last25Request.postDataParsed)) {
            const displayValue = value.length > 80 ? `${value.substring(0, 80)}... [${value.length} chars]` : value;
            console.log(`   ${key}: ${displayValue}`);
          }
        }
      }
    } else {
      console.log('\n⚠️  No transaction requests captured!');
      console.log('The AJAX request may not have been triggered. Check:');
      console.log('   1. Is the dropdown/filter visible?');
      console.log('   2. Was the search button clicked?');
      console.log('   3. Check debug-bnc-transactions-page.html for page state');
    }

    // Keep browser open for inspection
    console.log('\n⏳ Browser will stay open for 30 seconds for inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🧹 Browser closed');
    }
  }
}

main().catch(console.error);
