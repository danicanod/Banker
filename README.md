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

| Bank | Authentication | Transactions |
|------|---------------|--------------|
| **Banesco** | Username + Password + Security Questions | Full history |
| **BNC** | Card + ID + Password | Last 25 |

## Installation

```bash
npm install @danicanod/banker-venezuela
```

### Prerequisites

- Node.js >= 18
- npm >= 8

Playwright Chromium is installed automatically via postinstall.

## Quick Start

### Banesco

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

### BNC

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

### Quick Scrape

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

### BanescoClient

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela';

const client = createBanescoClient(credentials, config);

await client.login();
const accounts = await client.getAccounts();
const movements = await client.getAccountMovements(accountNumber);
await client.close();
```

### BncClient

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient(credentials, config);

await client.login();
const result = await client.getTransactions();
await client.close();
```

### BanescoAuth (Low-level)

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

### BncHttpClient (Low-level)

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
  logoutFirst?: boolean; // Default: true
}
```

## Environment Variables

Create a `.env` file based on `env.example`:

```bash
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password
CONVEX_URL=https://your-deployment.convex.cloud
```

## Examples

```bash
npm run example:banesco
npm run example:banesco-hybrid
npm run example:bnc
```

## Usage Guide

### Automatic Sync

Convex crons handle sync automatically:

| Cron Job | Schedule |
|----------|----------|
| `sync-banesco-transactions` | Daily 07:00 VE |
| `sync-notion-bidirectional` | Every 15 min |

**Deploy:**
```bash
npx convex deploy
```

**Convex environment variables** (set in [Convex Dashboard](https://dashboard.convex.dev)):
```bash
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais
NOTION_API_TOKEN=secret_xxx
NOTION_MOVIMIENTOS_DATABASE_ID=your_database_id
NOTION_CARTERAS_BANESCO_PAGE_ID=your_page_id
NOTION_CARTERAS_BNC_PAGE_ID=your_page_id
```

### Manual Sync

```bash
npm run sync:banesco
npm run sync:bnc
```

**Local `.env`:**
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

| Directory | Description |
|-----------|-------------|
| `src/banks/banesco/` | Banesco client |
| `src/banks/bnc/` | BNC client |
| `src/shared/` | Shared utilities |
| `convex/` | Backend + Notion sync |
| `scripts/` | Sync scripts |

## Architecture

```
src/
├── index.ts
├── banks/
│   ├── banesco/
│   │   ├── client.ts
│   │   ├── auth/
│   │   ├── http/
│   │   └── types/
│   └── bnc/
│       ├── client.ts
│       ├── http/
│       └── types/
└── shared/
    ├── base-bank-auth.ts
    └── utils/
```

## Development

```bash
npm install
npm run type-check
npm run build
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
