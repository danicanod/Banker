# Banker Scrapers VE

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

**TypeScript library for scraping Venezuelan bank accounts**

[Installation](#installation) • [Quick Start](#quick-start) • [API](#api) • [Security](#security) • [Development](#development)

</div>

---

## Supported Banks

| Bank | Mode | Authentication | Transactions |
|------|------|----------------|--------------|
| **Banesco** | Hybrid (Playwright login + HTTP fetch) | Username + Password + Security Questions | Full history with date range |
| **BNC** | HTTP-only (no browser) | Card + ID + Password (3-step) | Last 25 transactions |

## Installation

```bash
npm install banker-scrapers-ve
```

**Prerequisites:** Node.js >= 18, npm >= 8

Playwright Chromium is installed automatically via postinstall (required for Banesco).

## Quick Start

### Banesco (Hybrid Mode)

```typescript
import { BanescoScraper } from 'banker-scrapers-ve';

const scraper = new BanescoScraper({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'anime:Naruto,mascota:Firulais'
}, {
  headless: true,
  logLevel: 'warn' // Minimal logging by default
});

const session = await scraper.scrapeAll();
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### BNC (HTTP-only)

```typescript
import { BncScraper } from 'banker-scrapers-ve';

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
import { quickScrapeBanesco, quickScrapeBnc } from 'banker-scrapers-ve';

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
import { BanescoScraper, BncScraper } from 'banker-scrapers-ve';

// Bank-specific (smaller bundle)
import { BanescoScraper } from 'banker-scrapers-ve/banesco';
import { BncScraper } from 'banker-scrapers-ve/bnc';
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

## Configuration

### Environment Variables

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
```

### Logging

By default, the library logs minimally (only warnings and errors). Configure with:

```typescript
const scraper = new BanescoScraper(credentials, {
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug'
});
```

### Session Persistence

Session persistence is **disabled by default** for security. To enable (development only):

```typescript
const scraper = new BanescoScraper(credentials, {
  sessionPersistence: {
    enabled: true,
    // Optional: provide your own storage provider
    storageProvider: mySecureStorageProvider
  }
});
```

## Security

> **Important**: Read [SECURITY.md](SECURITY.md) before using in production.

- **Never commit credentials** to version control
- **Session files** (`.sessions/`) contain sensitive data and are gitignored
- **Logging is minimal by default** to prevent credential leakage
- **Session persistence is disabled by default**

For production deployments:
- Use environment variables or a secrets manager for credentials
- Implement your own secure session storage if needed
- Set `logLevel: 'error'` or `'silent'`

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
npm test              # Run tests

# Examples
npm run example:banesco
npm run example:banesco-hybrid
npm run example:bnc
```

## Disclaimer

This library is provided for personal use with your own banking accounts. Users are responsible for:

- Complying with their bank's Terms of Service
- Using the library responsibly and ethically
- Securing their own credentials

See [DISCLAIMER.md](DISCLAIMER.md) for full details.

## License

MIT License – see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Venezuelan developer community**

</div>
