# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**TypeScript library for connecting to Venezuelan bank accounts**

[Installation](#installation) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Configuration](#configuration)

</div>

---

## Supported Banks

| Bank | Mode | Authentication | Transactions | Speed |
|------|------|---------------|--------------|-------|
| **Banesco** | Hybrid (Playwright login + HTTP fetch) | Username + Password + Security Questions | Full history | Fast after login |
| **BNC** | Pure HTTP (no browser) | Card + ID + Password | Last 25 transactions | ~8-10x faster |

## Installation

```bash
npm install @danicanod/banker-venezuela
```

### Prerequisites

- Node.js >= 18
- npm >= 8

Playwright Chromium is installed automatically via postinstall (required for Banesco login).

## Quick Start

### Banesco (Hybrid Mode)

Banesco requires Playwright for login (iframes + security questions), then uses HTTP for fast data fetch.

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela';

const client = createBanescoClient({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'anime:Naruto,mascota:Firulais'
});

await client.login();

const accounts = await client.getAccounts();
console.log(`Found ${accounts.accounts.length} account(s)`);

const movements = await client.getAccountMovements(accounts.accounts[0].accountNumber);
console.log(`Found ${movements.transactions.length} transactions`);

await client.close();
```

### BNC (Pure HTTP - No Browser)

BNC uses pure HTTP requests - no browser automation needed. This is ~8-10x faster.

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient({
  id: 'V12345678',
  cardNumber: '1234567890123456',
  password: 'your_password'
});

await client.login();

const result = await client.getTransactions();
console.log(`Found ${result.data?.length} transactions`);

await client.close();
```

### Quick HTTP Scrape (BNC One-liner)

```typescript
import { quickHttpScrape } from '@danicanod/banker-venezuela';

const result = await quickHttpScrape({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});

console.log(`Found ${result.data?.length} transactions`);
```

## API Reference

### BanescoClient (Recommended)

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela';

const client = createBanescoClient(credentials, config);

// Login (uses Playwright internally)
await client.login();

// Fetch data (uses HTTP internally)
const accounts = await client.getAccounts();
const movements = await client.getAccountMovements(accountNumber);

// Status
client.isAuthenticated();

// Cleanup
await client.close();
```

### BncClient (Recommended)

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient(credentials, config);

// Login (pure HTTP)
await client.login();

// Fetch data (pure HTTP)
const result = await client.getTransactions();

// Status
client.isAuthenticated();

// Cleanup
await client.close();
```

### Advanced: BanescoAuth (Lower-level)

For more control over the Banesco authentication flow:

```typescript
import { BanescoAuth } from '@danicanod/banker-venezuela';

const auth = new BanescoAuth(credentials, config);
const result = await auth.login();

if (result.success) {
  const page = auth.getPage();
  const cookies = await page.context().cookies();
  // Use cookies for custom HTTP requests...
}

await auth.close();
```

### Advanced: BncHttpClient (Lower-level)

For direct HTTP access to BNC:

```typescript
import { createBncHttpClient } from '@danicanod/banker-venezuela';

const client = createBncHttpClient(credentials, { debug: true });

const loginResult = await client.login();
if (loginResult.success) {
  const transactions = await client.fetchLast25Transactions();
  console.log(transactions.data);
}

await client.reset();
```

## Configuration

### Banesco Config

```typescript
interface BanescoClientConfig {
  headless?: boolean;   // Default: true
  timeout?: number;     // Default: 60000ms
  debug?: boolean;      // Default: false
}
```

### BNC Config

```typescript
interface BncClientConfig {
  timeout?: number;     // Default: 30000ms
  debug?: boolean;      // Default: false
  logoutFirst?: boolean; // Default: true (clears existing sessions)
}
```

## Environment Variables

Create a `.env` file based on `env.example`:

```bash
# Banesco
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais

# BNC
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password

# Convex (for local sync scripts)
CONVEX_URL=https://your-deployment.convex.cloud
```

## Examples

Run the included examples:

```bash
# Banesco example
npm run example:banesco

# Banesco hybrid example (step-by-step)
npm run example:banesco-hybrid

# BNC example (pure HTTP)
npm run example:bnc

# Performance examples
npm run example:performance
```

## Usage Guide

This project has **two sync modes**: automatic (Convex crons) and manual (local scripts).

### Automatic Sync (Convex - Runs 24/7)

Once deployed, Convex handles everything automatically:

| Cron Job | Schedule | What it does |
|----------|----------|--------------|
| `sync-banesco-transactions` | Daily 07:00 VE | Scrapes Banesco via Browserbase → Convex |
| `sync-notion-bidirectional` | Every 15 min | Syncs Convex ↔ Notion (both directions) |

**Your data flows automatically:**
```
Banesco Bank → [Browserbase] → Convex DB → [Cron] → Notion Database
                                    ↑                      ↓
                              Notion edits sync back to Convex
```

**To deploy:**
```bash
npx convex deploy
```

**Required Convex Environment Variables** (set in [Convex Dashboard](https://dashboard.convex.dev)):
```bash
# Browserbase (for remote browser)
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id

# Banesco credentials
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais

# Notion integration
NOTION_API_TOKEN=secret_xxx
NOTION_MOVIMIENTOS_DATABASE_ID=your_database_id
NOTION_CARTERAS_BANESCO_PAGE_ID=your_page_id
NOTION_CARTERAS_BNC_PAGE_ID=your_page_id
```

### Manual Sync (Local Scripts)

For on-demand syncs from your machine:

```bash
# Sync Banesco transactions (uses local Playwright)
npm run sync:banesco

# Sync BNC transactions (pure HTTP, fast)
npm run sync:bnc
```

**Required local `.env`:**
```bash
CONVEX_URL=https://your-deployment.convex.cloud
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password
```

### Quick Reference

| I want to... | Command |
|--------------|---------|
| Deploy to production | `npx convex deploy` |
| Start local dev server | `npx convex dev` |
| Manually sync Banesco | `npm run sync:banesco` |
| Manually sync BNC | `npm run sync:bnc` |
| Run tests | `npm run test` |
| Type check | `npm run type-check` |

### Features

- **Idempotent ingestion**: Duplicate transactions are automatically skipped
- **Deterministic IDs**: Transaction keys use SHA-256 hashes for collision resistance
- **Overlap prevention**: Cron jobs won't run concurrently (lock mechanism)
- **Notion retry logic**: Handles rate limits (429) and transient errors
- **Schema validation**: Fails fast if Notion database schema drifts

## Documentation

Detailed documentation lives next to the code:

| Directory | Description | README |
|-----------|-------------|--------|
| `src/` | TypeScript library source | [src/README.md](src/README.md) |
| `src/banks/` | Bank client implementations | [src/banks/README.md](src/banks/README.md) |
| `src/banks/banesco/` | Banesco hybrid client | [src/banks/banesco/README.md](src/banks/banesco/README.md) |
| `src/banks/bnc/` | BNC pure HTTP client | [src/banks/bnc/README.md](src/banks/bnc/README.md) |
| `src/shared/` | Shared utilities and base classes | [src/shared/README.md](src/shared/README.md) |
| `convex/` | Convex backend + Notion sync | [convex/README.md](convex/README.md) |
| `scripts/` | Local sync scripts | [scripts/README.md](scripts/README.md) |

## Architecture

```
src/
├── index.ts                    # Main library exports
├── banks/
│   ├── banesco/
│   │   ├── client.ts           # BanescoClient (recommended)
│   │   ├── auth/               # Playwright-based login
│   │   ├── http/               # HTTP client for data fetch
│   │   ├── types/              # TypeScript types
│   │   └── examples/           # Usage examples
│   └── bnc/
│       ├── client.ts           # BncClient (recommended)
│       ├── http/               # Pure HTTP client
│       ├── types/              # TypeScript types
│       └── examples/           # Usage examples
└── shared/
    ├── base-bank-auth.ts       # Abstract auth base class
    ├── performance-config.ts   # Performance presets
    └── utils/                  # Shared utilities
```

## Development

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Build
npm run build

# Run examples
npm run example:banesco
npm run example:bnc
```

## Security

### Credential Management

#### Never Commit Secrets

- **Never** commit `.env` files or any file containing credentials
- Use `.gitignore` to exclude sensitive files (already configured)
- Store credentials in environment variables or secure secret managers

#### Required Secrets

| Secret | Used By | Storage Recommendation |
|--------|---------|------------------------|
| `BANESCO_USERNAME` | Library, Scripts | Environment variable |
| `BANESCO_PASSWORD` | Library, Scripts | Environment variable |
| `BANESCO_SECURITY_QUESTIONS` | Library, Scripts | Environment variable |
| `BNC_ID` | Library, Scripts | Environment variable |
| `BNC_CARD` | Library, Scripts | Environment variable |
| `BNC_PASSWORD` | Library, Scripts | Environment variable |
| `NOTION_API_TOKEN` | Convex Actions | Convex Dashboard secrets |
| `BROWSERBASE_API_KEY` | Convex Actions | Convex Dashboard secrets |

#### Convex Secrets

For Convex deployments, set secrets via the Convex Dashboard or CLI:

```bash
npx convex env set NOTION_API_TOKEN "secret_xxx..."
npx convex env set BROWSERBASE_API_KEY "bb_xxx..."
```

### Session Security

#### Local Sessions

- Session data is stored in `.sessions/` directory (gitignored)
- Sessions expire after 24 hours by default
- Clear sessions manually if compromised: `rm -rf .sessions/`

#### Cookie Handling

- Cookies are stored in memory during scraping operations
- Cookies are not persisted to disk by default
- When transferring cookies between Playwright and HTTP clients, ensure the transfer happens in-memory only

### Logging Security

#### What NOT to Log

- Passwords or security question answers
- Session tokens or cookies
- Full API keys or tokens
- Personal identification numbers (cedula)

#### Safe Logging Practices

```typescript
// BAD: Logs full credentials
console.log('Logging in with:', credentials);

// GOOD: Logs masked identifier
console.log('Logging in as:', credentials.username.slice(0, 3) + '***');
```

### Network Security

#### Bank Connections

- All bank connections use HTTPS
- The library does not disable SSL verification
- Do not use this library on untrusted networks

#### Notion API

- Always use the official Notion API token
- Limit integration permissions to only required databases
- Regularly rotate API tokens

### Deployment Security

#### Local Development

- Use `.env` files for local development only
- Never share `.env` files between team members via insecure channels

#### Production (Convex)

- Use Convex's built-in secret management
- Enable audit logging if available
- Monitor for unusual sync patterns

#### CI/CD

- Use GitHub Secrets or equivalent for CI credentials
- Never print secrets in CI logs
- Use secret masking features

### Vulnerability Reporting

If you discover a security vulnerability, please:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly at danicanod@gmail.com
3. Include steps to reproduce if possible
4. Allow reasonable time for a fix before disclosure

### Security Checklist

Before deploying to production:

- [ ] All secrets are stored in environment variables (not hardcoded)
- [ ] `.env` file is in `.gitignore`
- [ ] Logging does not expose sensitive data
- [ ] Notion integration has minimal required permissions
- [ ] Session directory is excluded from version control
- [ ] CI/CD secrets are properly configured

## Code Style

### Logging

#### When to Log

- **Info**: Major lifecycle events (login started, login completed, session closed)
- **Warn**: Recoverable issues (retry attempt, fallback used)
- **Error**: Failures that need attention
- **Debug**: Detailed flow information (only shown when debug mode is on)

#### What to Include

- Component name in brackets: `[BanescoClient]`
- Short action description: `login started`, `fetching transactions`
- Relevant IDs (masked): `user=V12***`, `account=***1234`
- Duration when measuring performance: `(1234ms)`

#### What NOT to Include

- Emojis in log output
- Long ASCII banners or separators
- Secrets, passwords, or full tokens
- Verbose stack traces in production

#### Log Format

```
timestamp level [component] message (optional data)
```

Example output:
```
12:34:56.789 info  [BanescoClient] login started
12:34:58.123 info  [BanescoClient] login completed (1334ms)
12:34:58.456 debug [BanescoHttpClient] fetching accounts
```

### Comments

#### Good Comments (why/constraints)

```typescript
// Banesco requires iframe navigation; direct fetch doesn't work
// Retry with exponential backoff to handle rate limiting
// ASP.NET postback requires these hidden fields
```

#### Avoid

```typescript
// ============================================
// This section handles the login flow
// ============================================

// Loop through the array
for (const item of items) { ... }

// Set the variable to true
isLoggedIn = true;
```

### Naming Conventions

- **Variables/functions**: `camelCase`
- **Classes/types**: `PascalCase`
- **Constants**: `camelCase` or `UPPER_CASE` for true constants
- **Enum members**: `PascalCase`
- **Files**: `kebab-case.ts`

### TypeScript Best Practices

- Prefer `unknown` over `any` when type is uncertain
- Use `const` by default, `let` only when reassignment is needed
- Prefix unused parameters with `_` or omit from catch blocks

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Venezuelan developer community**

</div>
