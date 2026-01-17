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

3. **Playwright Transactions** - Untested (blocked by session conflicts during testing)

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

### Priority 1: Fix Transaction Fetching
1. Run Playwright scraper with network capture enabled:
   ```bash
   npm run capture:bnc
   ```
2. Look for AJAX calls to understand how transactions are loaded
3. The transactions page likely requires:
   - A specific POST request with form data
   - Or an AJAX endpoint like `/Accounts/Transactions/GetLast25`

### Priority 2: Handle Session Conflicts
Options:
1. Implement a "force logout" endpoint call before login
2. Add a retry with exponential backoff
3. Document that users should wait for session timeout

### Priority 3: Test End-to-End
1. Wait for any existing session to timeout
2. Run: `source .env && BNC_DEBUG=true npm run example:bnc-http`
3. Verify login succeeds
4. Check if transactions are returned

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
BNC_CARD=5410360143997535
BNC_ID=27198516
BNC_PASSWORD=YourPassword
BNC_DEBUG=true                    # Optional: verbose logging
BNC_FORCE_PLAYWRIGHT=true         # Optional: skip HTTP mode
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
