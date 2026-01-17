# Banesco HTTP Scraper - Handoff Document

## Summary

Implemented a **hybrid** scraper for Banesco that uses Playwright for login (required due to iframes/JS) and pure HTTP for fast data fetching. This provides ~10x faster transaction retrieval compared to full Playwright scraping.

## Recent Fixes (Jan 17, 2026)

### 1. Fixed Console Logging
Replaced 14 direct `console.log` calls with `this.log()` to respect the debug flag. Debug file writes are now conditional on `config.debug`.

### 2. Translated Spanish Logs to English
All logging in `security-questions.ts` is now in English for consistency.

### 3. Fixed ASP.NET Form Fields Type Mismatch
Removed broken references to non-existent properties (`formFields.viewState`). Now properly spreads both `allHiddenFields` and `formFields` objects.

### 4. Exported HTTP Client from Main Index
Added `BanescoHttpClient` and related types to the main library exports.

## What Was Implemented

### 1. Shared HTTP Utilities (`src/shared/utils/http-client.ts`)
- **`CookieFetch`** class: Wrapper around fetch with automatic cookie jar (using `tough-cookie`)
- **`extractAspNetFields()`**: Parse ASP.NET hidden fields (__VIEWSTATE, etc.)
- **`extractTableData()`**: Parse HTML tables with cheerio

### 2. Banesco Form Parser (`src/banks/banesco/http/form-parser.ts`)
- **`parseAspNetFormFields()`**: Extract __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION
- **`parseAllHiddenFields()`**: Get all hidden inputs
- **`parseAccountsFromDashboard()`**: Parse GridViewHm table for accounts with postback targets
- **`parsePostBackActions()`**: Discover WebForms postback navigation actions
- **`findBestTransactionPostBack()`**: Score and select best postback for transactions
- **`buildPostBackFormData()`**: Build form data for postback execution
- **`buildHuella()`**: Generate browser fingerprint string

### 3. Banesco HTTP Client (`src/banks/banesco/http/banesco-http-client.ts`)
- **`BanescoHttpClient`** class with:
  - `importCookiesFromPlaywright()`: Import session cookies from Playwright context
  - `getAccounts()`: Fetch accounts from dashboard
  - `getAccountMovements()`: Navigate to movements page and submit date form
  - `getTransactions()`: Legacy transaction fetch method
- Factory functions: `createBanescoHttpClient()`, `quickHttpLogin()`

### 4. Hybrid Example (`src/banks/banesco/examples/hybrid-usage.ts`)
- Demonstrates: Playwright login → Cookie export → HTTP data fetch
- Run with: `npm run example:banesco-hybrid`

## Architecture: Why Hybrid?

```
┌─────────────────────────────────────────────────────────────────┐
│                    BANESCO HYBRID FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: Playwright (REQUIRED for login)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  - Login page uses iframes                                │  │
│  │  - Multi-step auth: username → security questions → pass  │  │
│  │  - JavaScript required for form submission                │  │
│  │  - Session warnings ("conexión activa") need handling     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  PHASE 2: Cookie Handoff                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  page.context().cookies() → httpClient.importCookies()    │  │
│  │  Key cookie: ASP.NET_SessionId                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  PHASE 3: HTTP Data Fetching (~10x faster)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  1. GET /Mantis/WebSite/Default.aspx (dashboard)          │  │
│  │  2. Parse accounts from GridViewHm table                  │  │
│  │  3. POST __doPostBack to select account                   │  │
│  │  4. POST "Consultar" form with dates to get transactions  │  │
│  │  5. Parse transaction table                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight:** Banesco transactions are NOT a simple page fetch. You must:
1. Navigate to the movements WebForms page (via dashboard postback)
2. Submit the "Consultar" form with proper hidden fields + date inputs

## Current Status

### ✅ Working
1. **Playwright Login** - Successfully authenticates via:
   - Navigate to `Login.aspx`
   - Wait for iframe `#ctl00_cp_frmAplicacion`
   - Step A: Enter username → click "Aceptar"
   - Step B: Answer security questions (0-2) → "Aceptar"
   - Step C: Enter password → "Aceptar"
   - Handle "sesión activa" warning if shown

2. **Cookie Handoff** - Transfers session from Playwright to HTTP:
   ```typescript
   const cookies = await page.context().cookies();
   httpClient.importCookiesFromPlaywright(cookies);
   ```

3. **HTTP Accounts** - Parses dashboard GridViewHm table:
   - Account type, number, balance
   - Postback target for navigation

4. **HTTP Transactions** - Full WebForms flow:
   - Navigate via postback
   - Submit date filter form
   - Parse transaction table (flexible row detection)

5. **Build** - TypeScript compiles successfully (verified Jan 17, 2026)

### ⚠️ Known Issues

1. **Pure HTTP Login NOT Possible** - Banesco requires:
   - JavaScript execution
   - iframe handling
   - Multi-step dynamic forms
   - **Solution:** Always use Playwright for login, HTTP for data

2. **Session Cookies Rotate** - The HTTP client must use cookies consistently:
   - Use `importCookiesFromPlaywright()` after Playwright login
   - Don't mix cookie contexts

3. **Security Questions Variability** - Banesco may ask:
   - 0 questions (cached trust)
   - 1-2 questions (random selection)
   - **Solution:** Provide comprehensive keyword→answer mappings

4. **Date Range Hardcoded** - Currently fetches current month only:
   - `PeriodoMes` with first of month to today
   - **TODO:** Make configurable

## Files Modified/Created

```
src/
├── banks/
│   └── banesco/
│       ├── index.ts                    # Added HTTP client exports
│       ├── auth/
│       │   ├── banesco-auth.ts         # Playwright login with iframe handling
│       │   └── security-questions.ts   # English logs, keyword matching
│       ├── http/
│       │   ├── index.ts                # NEW - HTTP module exports
│       │   ├── banesco-http-client.ts  # NEW - HTTP client with hybrid support
│       │   └── form-parser.ts          # NEW - ASP.NET/WebForms parsing
│       └── examples/
│           ├── basic-usage.ts          # Playwright example
│           ├── http-usage.ts           # HTTP-only example (won't work alone)
│           └── hybrid-usage.ts         # NEW - Hybrid example (recommended)
├── index.ts                            # Added HTTP client exports
└── shared/
    └── utils/
        └── http-client.ts              # Shared HTTP utilities

docs/
└── banesco-hybrid-handoff.md           # Detailed implementation docs

package.json                            # Added example:banesco-hybrid script
```

## Dependencies Used

```json
{
  "dependencies": {
    "cheerio": "^1.1.2",
    "tough-cookie": "^6.0.0"
  },
  "devDependencies": {
    "@types/cheerio": "^0.22.35",
    "@types/tough-cookie": "^4.0.5"
  }
}
```

## Environment Variables

```bash
BANESCO_USERNAME=your_username
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS="keyword1:answer1,keyword2:answer2,keyword3:answer3"

# Example security questions mapping:
BANESCO_SECURITY_QUESTIONS="anime:SNK,pareja:Barquisimeto,novio:Leonel,mascota:Felix"
```

## Quick Test Commands

```bash
# Build
npm run build

# Test hybrid scraper (recommended)
npm run example:banesco-hybrid

# Test Playwright-only scraper
npm run example:banesco

# Capture network for debugging
npm run capture:banesco
```

## Banesco API Reference (from Network Analysis)

### Dashboard URL
```
https://www.banesconline.com/Mantis/WebSite/Default.aspx
```

### Account Table
- Selector: `table.GridViewHm`
- Row class: `tr.GridViewHmRow`
- Account link: Contains `__doPostBack('ctl00$cp$gvCtas','select$N')`
- Balance: Cell with `align="right"`, format `1.234,56`

### Movements Flow
```
1. GET /Mantis/WebSite/Default.aspx
   Response: Dashboard HTML with account links

2. POST /Mantis/WebSite/Default.aspx (postback)
   Body: __EVENTTARGET=ctl00$cp$gvCtas, __EVENTARGUMENT=select$0, __VIEWSTATE=...
   Response: Redirect or MovimientosCuenta.aspx form

3. POST /Mantis/WebSite/consultamovimientoscuenta/MovimientosCuenta.aspx
   Body: 
     - __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION
     - ctl00$cp$TipoConsulta=rdbPeriodo
     - ctl00$cp$ddlPeriodo=PeriodoMes
     - ctl00$cp$dtFechaDesde=01/MM/YYYY
     - ctl00$cp$dtFechaHasta=DD/MM/YYYY
     - ctl00$cp$btnMostrar=Consultar
   Response: HTML with transaction table
```

### Transaction Table
- Headers: Fecha, Referencia, Descripción, Débito, Crédito, Saldo
- Date format: DD/MM/YYYY
- Amount format: Spanish (1.234,56)
- D/C indicator: Single letter "D" or "C" in separate column

## Code References

### Key method: Playwright Login
`src/banks/banesco/auth/banesco-auth.ts`: `BanescoAuth.performBankSpecificLogin()`

### Key method: Cookie Import
`src/banks/banesco/http/banesco-http-client.ts`: `BanescoHttpClient.importCookiesFromPlaywright()`

### Key method: Account Parsing
`src/banks/banesco/http/form-parser.ts`: `parseAccountsFromDashboard()`

### Key method: Transaction Flow
`src/banks/banesco/http/banesco-http-client.ts`: `BanescoHttpClient.getAccountMovements()` and `submitMovementsDateForm()`

### Key method: Flexible Row Parsing
`src/banks/banesco/http/banesco-http-client.ts`: `BanescoHttpClient.parseTransactionRowFlexible()`

## Next Steps

### Priority 1: Configurable Date Ranges
Add config inputs for:
- `from` / `to` dates
- Period presets (`PeriodoMes`, `PeriodoMesAnterior`, `PeriodoTrimestre`)

### Priority 2: Multi-Account Support
The hybrid example currently fetches movements for the first account only. Should iterate over all accounts.

### Priority 3: Session Caching
Cache Playwright cookies to skip login for subsequent runs until expiry.

### Priority 4: Unit Tests
Create fixtures with sanitized HTML for:
- Account parsing (GridViewHm)
- Transaction table parsing
- WebForms field extraction

## Comparison: Banesco vs BNC

| Feature | Banesco | BNC |
|---------|---------|-----|
| Pure HTTP Login | ❌ No (requires iframes/JS) | ✅ Yes |
| Recommended Mode | Hybrid (Playwright → HTTP) | HTTP-first with fallback |
| Session Handling | Cookie handoff | Cookie jar |
| Form Technology | ASP.NET WebForms | ASP.NET MVC |
| Transaction Fetch | POST with date form | AJAX endpoint |
| Security Questions | Yes (0-2 per login) | No |
