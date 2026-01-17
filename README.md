# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

**TypeScript library for scraping Venezuelan bank accounts**

[Installation](#installation) • [Quick Start](#quick-start) • [API](#api) • [Development](#development)

</div>

---

## Supported Banks

| Bank | Mode | Authentication | Transactions |
|------|------|----------------|--------------|
| **Banesco** | Hybrid (Playwright login + HTTP fetch) | Username + Password + Security Questions | Full history with date range |
| **BNC** | HTTP-only (no browser) | Card + ID + Password (3-step) | Last 25 transactions |

## Installation

```bash
npm install @danicanod/banker-venezuela
```

**Prerequisites:** Node.js >= 18, npm >= 8

Playwright Chromium is installed automatically via postinstall (required for Banesco).

## Quick Start

### Banesco (Hybrid Mode)

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
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### BNC (HTTP-only)

```typescript
import { BncScraper } from '@danicanod/banker-venezuela';

const scraper = new BncScraper({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});

const session = await scraper.scrapeAll();
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### One-liner (Quick Scrape)

```typescript
import { quickScrapeBanesco, quickScrapeBnc } from '@danicanod/banker-venezuela';

const banescoTx = await quickScrapeBanesco({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'anime:Naruto'
});

const bncTx = await quickScrapeBnc({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});
```

## Subpath Imports

The package exports bank-specific modules for tree-shaking:

```typescript
// Main entry (all exports)
import { BanescoScraper, BncScraper } from '@danicanod/banker-venezuela';

// Bank-specific (smaller bundle)
import { BanescoScraper } from '@danicanod/banker-venezuela/banesco';
import { BncScraper } from '@danicanod/banker-venezuela/bnc';
```

## API

Both scrapers expose the same interface:

| Method | Description |
|--------|-------------|
| `scrapeAll()` | Full session: authenticate + scrape transactions |
| `isAuthenticated()` | Check authentication status |
| `exportSession(session, filename?)` | Export session data to JSON file (returns filename) |
| `close()` | Cleanup resources |

**Banesco-only:**
- `authenticate()` – Authenticate without scraping
- `scrapeTransactions()` – Scrape transactions (requires prior auth)
- `getPage()` – Get the authenticated Playwright page

For detailed APIs, configuration options, and lower-level clients see the bank-specific docs:

- [Banesco documentation](src/banks/banesco/README.md)
- [BNC documentation](src/banks/bnc/README.md)

## Environment Variables

Create a `.env` file based on [`env.example`](env.example):

```bash
# Banesco
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais

# BNC
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password

# Convex (optional, for sync scripts)
CONVEX_URL=https://your-deployment.convex.cloud
```

## Optional: Syncing to Convex

Sync scripts push transactions to a Convex backend with idempotent ingestion:

```bash
npm run sync              # Banesco
npm run sync:bnc          # BNC
```

Requires `CONVEX_URL` in `.env` and a running Convex backend (`npx convex dev`).

---

## Development

### Project Structure

```
src/
├── index.ts                    # Main library exports
├── banks/
│   ├── banesco/                # Hybrid: Playwright login + HTTP data
│   └── bnc/                    # HTTP-only client
└── shared/
    ├── utils/                  # Browser, HTTP, session utilities
    └── performance-config.ts   # Performance presets (Banesco)
```

### Scripts

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript
npm run type-check    # Type check without emitting

# Examples
npm run example:banesco
npm run example:banesco-hybrid
npm run example:bnc
npm run example:performance
```

### Session Persistence

Banesco's optimized login flow stores browser sessions under `.sessions/` in the current working directory. Sessions expire after 24 hours and allow skipping security questions on repeat logins within that window.

### Security Notes

- Never commit `.env` files or credentials
- Session files (`.sessions/`) are gitignored

## License

MIT License – see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Venezuelan developer community**

</div>
