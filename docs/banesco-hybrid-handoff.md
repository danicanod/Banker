# Banesco Hybrid Fast-Mode (Playwright Login → HTTP Transactions) — Handoff

## Goal
Speed up Banesco scraping by using **Playwright only for login** (iframe + multi-step auth), then switching to **pure HTTP + HTML parsing** for accounts + transaction history.

This is now working end-to-end and returns **real transaction rows** (example run produced **80 transactions**).

---

## Current Working Flow (High Level)

### 1) Login (Playwright)
Login must remain browser-based because Banesco uses:
- iframes
- dynamic/multi-step UI
- security questions

Flow inside the iframe:
- **Step A**: username → click **Aceptar**
- **Step B**: security questions (0–2 prompts depending on session) → **Aceptar**
- **Step C**: password → **Aceptar**

Additional case handled:
- **“conexión activa / sesión activa”** warning screen: click **Aceptar**, then re-acquire the iframe and continue.

File: `src/banks/banesco/auth/banesco-auth.ts`

Env vars required:
- `BANESCO_USERNAME`
- `BANESCO_PASSWORD`
- `BANESCO_SECURITY_QUESTIONS`

Example mapping format (keywords → answers):
```
BANESCO_SECURITY_QUESTIONS="anime:SNK,pareja:Barquisimeto,novio:Leonel,mascota:Felix"
```

---

### 2) Cookie handoff (Playwright → HTTP)
After login:
- Extract cookies from the Playwright context (`page.context().cookies()`).
- Import them into the HTTP client (`importCookiesFromPlaywright`).

Important note:
- In observed runs, **only** `ASP.NET_SessionId` was needed.

Example script:
- `src/banks/banesco/examples/hybrid-usage.ts`

---

### 3) Accounts (HTTP)
HTTP client hits the dashboard and parses the account table:
- Dashboard endpoint: `https://www.banesconline.com/Mantis/WebSite/Default.aspx`
- Account table is `table.GridViewHm`
- Account row contains a postback link:
  - `javascript:__doPostBack('ctl00$cp$gvCtas','select$0')`
- Balance is in a neighboring `<td>` cell (Spanish decimal format like `983,02`)

Files:
- `src/banks/banesco/http/form-parser.ts` (account parsing)
- `src/banks/banesco/http/banesco-http-client.ts` (`getAccounts()`)

---

### 4) Transactions (HTTP) — The Key Fix
The transaction page is NOT “instant data” — it is a **WebForms filter form** that must be submitted.

Working flow:
1. **GET dashboard** (`Default.aspx`)
2. **POST __doPostBack** for the selected account (from the dashboard link)
3. Response redirects/lands on a **Movimientos form page** (HTML contains `btnMostrar` / “Consultar”)
4. **POST the form** with:
   - `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`
   - `ctl00$cp$TipoConsulta = rdbPeriodo`
   - `ctl00$cp$ddlPeriodo = PeriodoMes`
   - `ctl00$cp$dtFechaDesde = 01/MM/YYYY`
   - `ctl00$cp$dtFechaHasta = DD/MM/YYYY`
   - `ctl00$cp$btnMostrar = Consultar`
5. Parse the resulting HTML transaction table.

The movements page observed in HTML:
- `<form action="./MovimientosCuenta.aspx" id="aspnetForm"> ...`
- Consult button:
  - `ctl00$cp$btnMostrar` value `"Consultar"`

Implementation:
- `BanescoHttpClient.getAccountMovements()` now **forces this sequence** (dashboard postback → submit movements form → parse).
- `submitMovementsDateForm()` builds and posts the WebForms payload.
- Transaction parsing uses a flexible approach (similar to the older Playwright scraper):
  - find a date cell (DD/MM/YYYY)
  - find an amount cell (Spanish numeric formats)
  - pick description as the longest non-date, non-numeric cell
  - infer debit/credit via `D`/`C` or negative amount

File: `src/banks/banesco/http/banesco-http-client.ts`

---

## How To Run (Developer)
Example runner:
```bash
npm run build
npm run example:banesco-hybrid
```

Notes:
- Use `.env` for credentials + security mappings.
- Runs should be executed with permissions that allow reading `.env`.

---

## Debug Artifacts (Local)
During debugging, these files may be created in the repo root:
- `debug-banesco-dashboard.html`
- `debug-banesco-movements.html`
- `debug-banesco-transactions.html`
- `debug-banesco-*.log`

They are useful for:
- verifying WebForms fields exist
- confirming “Consultar” submission returns a table
- iterating on parser logic without rerunning login repeatedly

---

## Key Files Touched (Summary)
- `src/banks/banesco/auth/banesco-auth.ts`
  - robust iframe handling + multi-step flow + active-session warning handling
- `src/banks/banesco/http/form-parser.ts`
  - dashboard account parsing fixes (GridViewHm + correct balance parsing)
- `src/banks/banesco/http/banesco-http-client.ts`
  - hybrid HTTP flows: accounts + movements navigation + WebForms submit for transactions
  - flexible transaction parsing
- `src/banks/banesco/examples/hybrid-usage.ts`
  - example usage: login → cookie export → HTTP accounts/movements

---

## Known Edge Cases / Reliability Notes
- Banesco may randomly:
  - ask different security questions (keep mappings broad enough)
  - present “sesión/conexión activa” warning
  - show temporary outage (“En estos momentos no podemos procesar su operación…”)
- Session cookies can rotate; ensure the HTTP client uses the cookie jar consistently.

---

## Suggested Next Steps (Optional Improvements)

### 1) Make date range configurable
Right now, movements query submits **current month** (`PeriodoMes` and dates).
Add config inputs:
- `from` / `to` dates
- period presets (`PeriodoMesAnterior`, etc.)

### 2) Remove noisy `console.log` and route all logging via a logger
`BanescoHttpClient.getAccountMovements()` currently prints always-on console lines to make the flow obvious.
Move these to `this.log()` or a structured logger with a level toggle.

### 3) Improve transaction “type” inference
If Banesco returns explicit `D` / `C` column, prefer it.
If not, infer based on sign or column semantics.

### 4) Multi-account support in example
The example currently fetches movements for the first account; iterate over all accounts and aggregate.

### 5) Caching sessions
Cache Playwright cookies to skip login for subsequent runs until expiry.

### 6) Add automated regression fixtures
Store sanitized HTML fixtures (dashboard + movements + transactions) and unit-test parsing:
- accounts parsing (GridViewHm)
- form submission field build (WebForms payload)
- transaction extraction heuristics

---

## “What to tell the next agent”
The core breakthrough was realizing Banesco movements are **not a single page fetch**:
you must **navigate to the movements WebForms page** (via dashboard postback) and then **submit the “Consultar” form** with proper hidden fields + date inputs to get the actual transaction table.

