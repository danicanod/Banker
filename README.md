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

## Local Sync to Convex

Sync transactions to a Convex backend with idempotent ingestion:

```bash
# Sync Banesco transactions
npm run sync              # or npm run sync:banesco

# Sync BNC transactions (pure HTTP, fast)
npm run sync:bnc
```

Features:
- **Idempotent**: Duplicate transactions are automatically skipped
- **Deterministic IDs**: Transaction keys are hash-based for collision resistance
- **Events**: Each new transaction creates a `transaction.created` event for notifications

Requirements:
- Set `CONVEX_URL` in your `.env` file
- Run `npx convex dev` to start your Convex backend

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

- Never commit `.env` files or credentials
- Session data is stored locally in `.sessions/` (24h expiry)
- See [SECURITY.md](SECURITY.md) for security best practices

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Venezuelan developer community**

</div>
