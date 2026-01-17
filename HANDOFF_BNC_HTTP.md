# BNC HTTP Scraper - Handoff Document

## Summary

Implemented a pure HTTP-based scraper for BNC (Banco Nacional de Crédito) that allows login and transaction fetching without launching a browser. The implementation is complete but needs testing adjustments.

## Recent Fixes (Jan 17, 2026)

### 1. Fixed `basic-usage.ts` Missing dotenv
The Playwright example wasn't loading `.env` - it was using placeholder values like `"your_cedula"` instead of real credentials. Fixed by adding:
```typescript
import { config } from 'dotenv';
config();
```

### 2. Added `logout()` Method to HTTP Client
HTTP client now has `logout()` method and `logoutFirst` config option (default: true) to clear existing sessions before login.

### 3. Fixed `submitFirstForm` Pattern
Changed from `Promise.all([click, waitForSelector])` to sequential `await click()` then `await waitForSelector()` for more reliable AJAX handling.

## What Was Implemented

### 1. Shared HTTP Utilities (`src/shared/utils/http-client.ts`)
- **`CookieFetch`** class: Wrapper around fetch with automatic cookie jar (using `tough-cookie`)
- **`createCookieFetch()`**: Factory function
- **`extractRequestVerificationToken()`**: Extract CSRF tokens from HTML
- **`extractAspNetFields()`**: Parse ASP.NET hidden fields
- **`extractTableData()`**: Parse HTML tables with cheerio

### 2. BNC HTTP Client (`src/banks/bnc/http/bnc-http-client.ts`)
- **`BncHttpClient`** class with:
  - `login()`: 3-step HTTP authentication
  - `fetchLast25Transactions()`: Fetch transactions for all accounts
  - `parseTransactionsHtml()`: Parse BNC transaction tables
- Factory functions: `createBncHttpClient()`, `quickHttpLogin()`, `quickHttpScrape()`

### 3. Updated BNC Scraper (`src/banks/bnc/scrapers/bnc-scraper.ts`)
- HTTP-first mode (default) with Playwright fallback
- Config options: `forcePlaywright`, `disableFallback`
- Environment variable: `BNC_FORCE_PLAYWRIGHT=true`
- New methods: `scrapeHttpOnly()`, `scrapePlaywrightOnly()`, `getUsedMethod()`

### 4. Example Script (`src/banks/bnc/examples/http-usage.ts`)
- Run with: `npm run example:bnc-http`

## Current Status

### ✅ Working
1. **HTTP Login** - Successfully authenticates via:
   - `GET /` → extract `__RequestVerificationToken`
   - `POST /Auth/PreLogin_Try` → returns `Type: 200` with password form HTML
   - `POST /Auth/Login_Try` → returns `Type: 200` on success
   - `GET /Home/BNCNETHB/Welcome` → verify login

2. **Response Parsing** - Fixed to handle BNC's JSON format:
   ```json
   {"Type": 200, "Value": "<html>...", "Code": null, "Message": null}
   ```
   - `Type: 200` = success
   - `Type: 500` = error (check `Value` for HTML with error message)

3. **Build** - TypeScript compiles successfully

### ⚠️ Known Issues

1. **Session Conflict** - BNC tracks sessions server-side by user ID (not cookies):
   ```
   "Existe una sesión previa activa, la nueva sesión ha sido denegada"
   ```
   - **Timeout:** Sessions last ~5-10 minutes after last activity
   - **Workaround:** HTTP client has `logoutFirst: true` by default
   - **Note:** Playwright and HTTP clients use different cookie contexts, so they can't share sessions or clear each other's sessions
   - **Best practice:** Wait 5+ minutes between test runs, or use only one client type per session

2. **HTTP Transactions** - Now uses correct endpoint:
   - **AJAX Endpoint**: `POST /Accounts/Transactions/Last25_List`
   - **Form Data**: Serialized `#Frm_Accounts` (includes `__RequestVerificationToken`, `ddlAccounts`, etc.)
   - **Response**: JSON with `Type: 200` and `Value` containing HTML with `#Tbl_Transactions`
   - **Status**: Updated in HTTP client, needs testing without session conflicts
   
   From analysis of BNC's JavaScript files:
   ```javascript
   // Last25.js
   function FillMainData() { List("/Accounts/Transactions/Last25_List", false, false); }
   
   // Transactions.js  
   function List(n,t,i) { $.post(n, $("#Frm_Accounts").serialize(), function(n) { ... }); }
   ```

3. **Playwright Transactions** - Now working (see next section for details)

---

## Verified Working: Playwright Transaction Scraping (Jan 17, 2026)

Playwright-based transaction fetching is now confirmed working with real data.

### Test Results

- **Transactions retrieved:** 26 total (across 2 accounts)
- **Accounts scraped:** VES and USD accounts
- **Method:** `BncScraper` with `forcePlaywright: true`

### Key Fixes Applied

#### 1. Performance Config: Keep CSS for Scraping

BNC's transaction table uses Bootstrap-Select dropdowns. Without CSS, the dropdown icons are invisible and clicks time out.

**File:** `src/shared/performance-config.ts`

```typescript
BNC: {
  auth: PERFORMANCE_PRESETS.AGGRESSIVE,   // Keep JS for AJAX login
  scraping: PERFORMANCE_PRESETS.BALANCED  // Keep CSS for table visibility
}
```

#### 2. Resilient Dropdown Expansion

Detail expansion is optional and capped to avoid long timeouts if icons are not visible.

**File:** `src/banks/bnc/scrapers/transactions.ts` - `expandAllTransactionDetails()`

- Limits expansion attempts to first 5 icons
- Uses 2-second timeout per icon instead of 30 seconds
- Checks visibility before clicking
- Non-fatal: continues with extraction even if expansion fails

### How to Reproduce

**Step 1: Auth smoke test**
```bash
npm run example:bnc
```

**Step 2: Full scrape with transactions**
```bash
tsx -e "
import { config } from 'dotenv'; config();
import { BncScraper } from './src/banks/bnc/scrapers/bnc-scraper.ts';
const creds = { card: process.env.BNC_CARD, id: process.env.BNC_ID, password: process.env.BNC_PASSWORD };
const scraper = new BncScraper(creds, { forcePlaywright: true, headless: true });
scraper.scrapeAll().then(s => {
  console.log('Auth:', s.authResult.success ? 'OK' : 'FAIL');
  let t = 0; s.transactionResults.forEach(r => t += r.data?.length || 0);
  console.log('Transactions:', t);
});
"
```

### Important: Session Conflicts

BNC locks sessions server-side for 5-10 minutes. If you see `"sesión previa activa"`, wait before retrying. Do not run Playwright and HTTP tests back-to-back.

---

## Remaining Work: HTTP Transaction Fetching

### Current State

HTTP login works, but transaction fetching returns `Type: 500` with message `E00`.

### Root Cause (Hypothesis)

The HTTP client is not sending the complete serialized form payload. BNC's JavaScript does:

```javascript
$.post("/Accounts/Transactions/Last25_List", $("#Frm_Accounts").serialize(), ...)
```

The HTTP client currently sends only hidden inputs and `ddlAccounts`, but may be missing:
- The actual `<select>` value (Bootstrap-Select stores it differently)
- Additional form fields rendered by JavaScript
- Required headers (`X-Requested-With: XMLHttpRequest`)

### Next Steps for HTTP Transactions

1. **Capture exact POST body** - Run the network capture script while clicking filter/account/search in browser:
   ```bash
   npm run capture:bnc
   ```
   Examine the JSON output for the POST to `/Accounts/Transactions/Last25_List`.

2. **Update HTTP client** - Mirror the exact payload structure in `src/banks/bnc/http/bnc-http-client.ts`:
   - Ensure `select` elements are included (not just hidden inputs)
   - Add `X-Requested-With: XMLHttpRequest` header
   - Match content-type exactly

3. **Test with fresh session** - Wait for session timeout, then run:
   ```bash
   BNC_DEBUG=true npm run example:bnc-http
   ```

### Data Quality Note

Transaction parsing may need column alignment fixes. The sample transaction showed:
- Date format issues (e.g., `2026063941-01-14` instead of `2026-01-14`)
- Description/amount column swap

Suggestion: Log raw extracted rows/headers during parsing to verify column mapping.

---

## Files Modified/Created

```
src/
├── shared/
│   ├── index.ts                    # Added HTTP client exports
│   └── utils/
│       └── http-client.ts          # NEW - Shared HTTP utilities
├── banks/
│   └── bnc/
│       ├── index.ts                # Added HTTP client exports
│       ├── http/
│       │   ├── index.ts            # NEW - HTTP module exports
│       │   └── bnc-http-client.ts  # NEW - BNC HTTP client
│       ├── scrapers/
│       │   └── bnc-scraper.ts      # Modified - Added HTTP mode
│       └── examples/
│           ├── basic-usage.ts      # Fixed ESM compatibility
│           └── http-usage.ts       # NEW - HTTP usage examples

package.json                        # Added example:bnc-http script
```

## Dependencies Added

```json
{
  "dependencies": {
    "tough-cookie": "^6.0.0"
  },
  "devDependencies": {
    "@types/tough-cookie": "^4.0.5"
  }
}
```

## Next Steps

### Priority 1: Complete HTTP Transaction Fetching
The AJAX endpoint is known (`POST /Accounts/Transactions/Last25_List`), but the exact payload is incomplete.

1. Capture the exact POST body using `npm run capture:bnc` (with filter/account/search clicks)
2. Update `src/banks/bnc/http/bnc-http-client.ts` `fetchAccountTransactions()` to match
3. Verify with `BNC_DEBUG=true npm run example:bnc-http`

### Priority 2: Fix Transaction Parsing
Column mapping may be off. Steps:
1. Add debug logging in `parseTransactionsHtml()` to print raw row data
2. Align columns: Date, Type, Reference, Amount, Description
3. Fix date parsing in `parseDate()` method

### Priority 3: Session Management (Optional)
Current workaround (wait 5+ min) works. If automation is needed:
1. Implement server-side session invalidation if BNC supports it
2. Or add retry with exponential backoff (30s, 60s, 120s)

## BNC API Reference (from Network Capture)

### Login Flow
```
1. GET https://personas.bncenlinea.com/
   Response: HTML with __RequestVerificationToken in hidden input

2. POST https://personas.bncenlinea.com/Auth/PreLogin_Try
   Headers: X-Requested-With: XMLHttpRequest
   Body: __RequestVerificationToken, prv_LoginType=NATURAL, prv_InnerLoginType=1, CardNumber, UserID
   Response: {"Type":200,"Value":"<password form HTML>"}

3. POST https://personas.bncenlinea.com/Auth/Login_Try
   Headers: X-Requested-With: XMLHttpRequest
   Body: __RequestVerificationToken (from step 2 response), prv_InnerLoginType=1, UserPassword
   Response: {"Type":200,"Value":null} on success

4. GET https://personas.bncenlinea.com/Home/BNCNETHB/Welcome
   Verify we're logged in (check for logout button, no login form)
```

### Transactions
```
GET https://personas.bncenlinea.com/Accounts/Transactions/Last25
- May need POST with ddlAccounts=1,2,3 for different accounts
- Table ID: #Tbl_Transactions
- Row selector: tbody tr.cursor-pointer
```

## Environment Variables

```bash
# Required credentials (set in .env file)
BNC_CARD=<16-digit card number>
BNC_ID=<cedula number>
BNC_PASSWORD=<password>

# Optional flags
BNC_DEBUG=true                    # Verbose logging
BNC_FORCE_PLAYWRIGHT=true         # Skip HTTP mode, use browser only
```

## Quick Test Commands

```bash
# Build
npm run build

# Test HTTP scraper
source .env && BNC_DEBUG=true npm run example:bnc-http

# Test Playwright scraper
source .env && npm run example:bnc

# Capture network for debugging
npm run capture:bnc
```

## Code References

### Key method: HTTP Login
`src/banks/bnc/http/bnc-http-client.ts`: `BncHttpClient.login()`

### Key method: Transaction Parsing
`src/banks/bnc/http/bnc-http-client.ts`: `BncHttpClient.fetchAccountTransactions()` and `BncHttpClient.parseTransactionsHtml()`

### Scraper with fallback
`src/banks/bnc/scrapers/bnc-scraper.ts`: `BncScraper.scrapeAll()` / `scrapeAllHttp()` / `scrapeAllPlaywright()`
