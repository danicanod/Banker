# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**TypeScript library for scraping Venezuelan bank accounts**

[Installation](#installation) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Configuration](#configuration)

</div>

---

## Supported Banks

| Bank | Mode | Authentication | Transactions | Speed |
|------|------|---------------|--------------|-------|
| **Banesco** | Hybrid (Playwright login + HTTP fetch) | Username + Password + Security Questions | Full history with date range | Fast after login |
| **BNC** | Pure HTTP (no browser) | Card + ID + Password (3-step) | Last 25 transactions | ~8-10x faster |

## Installation

```bash
npm install @danicanod/banker-venezuela
```

### Prerequisites

- Node.js >= 18
- npm >= 8

Playwright Chromium is installed automatically via postinstall (required for Banesco).

## Quick Start

### Banesco (Hybrid Mode)

Banesco requires Playwright for login (iframes + security questions), then uses HTTP for fast data fetch.

```typescript
import { BanescoScraper } from '@danicanod/banker-venezuela';

const scraper = new BanescoScraper({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'anime:Naruto,mascota:Firulais'
}, {
  headless: true,
  performancePreset: 'AGGRESSIVE'
});

const session = await scraper.scrapeAll();

console.log(`Auth: ${session.authResult.success}`);
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### BNC (Pure HTTP - No Browser)

BNC uses pure HTTP requests - no browser automation needed. This is ~8-10x faster.

```typescript
import { BncScraper } from '@danicanod/banker-venezuela';

const scraper = new BncScraper({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});

const session = await scraper.scrapeAll();

console.log(`Auth: ${session.authResult.success}`);
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### Quick Scrape (One-liner)

```typescript
import { quickScrapeBanesco, quickScrapeBnc } from '@danicanod/banker-venezuela';

// Banesco
const banescoTx = await quickScrapeBanesco({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'anime:Naruto'
});

// BNC (pure HTTP)
const bncTx = await quickScrapeBnc({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});
```

## API Reference

### Main Scraper Classes

#### BanescoScraper (Hybrid)

```typescript
const scraper = new BanescoScraper(credentials, config);

// Authentication
await scraper.authenticate();
scraper.isAuthenticated();

// Scraping
await scraper.scrapeAll();           // Full session (auth + transactions)
await scraper.scrapeTransactions();  // Transactions only (requires auth)

// Session management
scraper.getPage();                   // Get authenticated Playwright page
scraper.exportSession(session);      // Export session data to JSON file
await scraper.close();               // Cleanup browser
```

#### BncScraper (Pure HTTP)

```typescript
const scraper = new BncScraper(credentials, config);

// Scraping (includes authentication)
await scraper.scrapeAll();           // Full session (auth + transactions)

// Status
scraper.isAuthenticated();
scraper.getUsedMethod();             // Always returns 'http'

// Session management
scraper.exportSession(session);      // Export session data to JSON file
await scraper.close();               // Cleanup
```

### Banesco Auth & Scrapers (Lower-level)

For more control over the Banesco authentication flow:

```typescript
import { BanescoAuth } from '@danicanod/banker-venezuela';

const auth = new BanescoAuth(credentials, config);
const result = await auth.login();

if (result.success) {
  const page = auth.getPage();
  // Use page for custom scraping...
}

await auth.close();
```

### BNC HTTP Client (Lower-level)

For direct HTTP access to BNC:

```typescript
import { BncHttpClient, createBncHttpClient } from '@danicanod/banker-venezuela';

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
interface BanescoConfig {
  headless?: boolean;           // Default: false
  timeout?: number;             // Default: 30000ms
  debug?: boolean;              // Default: false
  performancePreset?: string;   // 'MAXIMUM' | 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE' | 'NONE'
  performance?: PerformanceConfig;
  closeAfterScraping?: boolean; // Default: true
}
```

### BNC Config

```typescript
interface BncConfig {
  timeout?: number;             // Default: 30000ms
  debug?: boolean;              // Default: false
  closeAfterScraping?: boolean; // Default: true
  logoutFirst?: boolean;        // Default: true (clears existing sessions)
}
```

### Performance Presets (Banesco only)

| Preset | Speed Gain | Description |
|--------|-----------|-------------|
| `MAXIMUM` | 70-80% | Blocks everything except essential functionality |
| `AGGRESSIVE` | 60-70% | Blocks most resources, keeps essential JS |
| `BALANCED` | 40-50% | Keeps CSS for visual feedback |
| `CONSERVATIVE` | 20-30% | Minimal blocking |
| `NONE` | 0% | No blocking (debugging) |

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
# Banesco example (hybrid mode)
npm run example:banesco

# Banesco hybrid example (recommended)
npm run example:banesco-hybrid

# BNC example (pure HTTP)
npm run example:bnc

# Performance optimization examples
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
│   │   ├── auth/               # Playwright-based authentication
│   │   ├── http/               # HTTP client for fast data fetch
│   │   ├── scrapers/           # Transaction/account scraping
│   │   ├── types/              # TypeScript types
│   │   └── examples/           # Usage examples
│   └── bnc/
│       ├── http/               # Pure HTTP client (auth + scraping)
│       ├── scrapers/           # HTTP-based scraper wrapper
│       ├── types/              # TypeScript types
│       └── examples/           # Usage examples
└── shared/
    ├── base-bank-auth.ts       # Abstract auth base class (Banesco)
    ├── base-bank-scraper.ts    # Abstract scraper base class (Banesco)
    ├── performance-config.ts   # Performance presets
    └── utils/                  # Shared utilities (HTTP client, etc.)
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
