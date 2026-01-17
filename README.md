# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=for-the-badge&logo=playwright&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**TypeScript library for scraping Venezuelan bank accounts using Playwright**

[Installation](#installation) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Configuration](#configuration)

</div>

---

## Supported Banks

| Bank | Authentication | Transactions | Accounts | Session Restore |
|------|---------------|--------------|----------|-----------------|
| **Banesco** | Username + Password + Security Questions | Full history with date range | Balance extraction | Yes (24h) |
| **BNC** | Card + ID + Password (3-step) | Last 25 transactions | Not yet | No |

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

### BNC

```typescript
import { BncScraper } from '@danicanod/banker-venezuela';

const scraper = new BncScraper({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
}, {
  headless: true,
  performancePreset: 'MAXIMUM'
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

// BNC
const bncTx = await quickScrapeBnc({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});
```

## API Reference

### Main Scraper Classes

Both `BanescoScraper` and `BncScraper` share the same API:

```typescript
// Create scraper
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

### Auth Classes (Lower-level)

For more control over the authentication flow:

```typescript
import { BanescoAuth, BncAuth } from '@danicanod/banker-venezuela';

const auth = new BanescoAuth(credentials, config);
const result = await auth.login();

if (result.success) {
  const page = auth.getPage();
  // Use page for custom scraping...
}

await auth.close();
```

### Transaction Scrapers (Lower-level)

```typescript
import { BanescoTransactionsScraper, BncTransactionsScraper } from '@danicanod/banker-venezuela';

// After authentication, pass the page to the scraper
const scraper = new BanescoTransactionsScraper(page, config);
const result = await scraper.scrapeTransactions();

console.log(result.data); // Array of transactions
```

## Configuration

### Performance Presets

```typescript
const config = {
  headless: true,
  performancePreset: 'MAXIMUM' // 'MAXIMUM' | 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE' | 'NONE'
};
```

| Preset | Speed Gain | Description |
|--------|-----------|-------------|
| `MAXIMUM` | 70-80% | Blocks everything except essential functionality |
| `AGGRESSIVE` | 60-70% | Blocks most resources, keeps essential JS |
| `BALANCED` | 40-50% | Keeps CSS for visual feedback |
| `CONSERVATIVE` | 20-30% | Minimal blocking |
| `NONE` | 0% | No blocking (debugging) |

### Custom Performance Config

```typescript
const config = {
  performance: {
    blockCSS: true,
    blockImages: true,
    blockFonts: true,
    blockMedia: true,
    blockNonEssentialJS: false,
    blockAds: true,
    blockAnalytics: true
  }
};
```

### Full Config Options

```typescript
interface ScraperConfig {
  headless?: boolean;           // Default: false
  timeout?: number;             // Default: 30000ms
  debug?: boolean;              // Default: false
  performancePreset?: string;   // See presets above
  performance?: PerformanceConfig;
  closeAfterScraping?: boolean; // Default: true
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
```

## Examples

Run the included examples:

```bash
# Banesco example
npm run example:banesco

# BNC example
npm run example:bnc

# Performance optimization examples
npm run example:performance
```

## Architecture

```
src/
├── index.ts                    # Main library exports
├── banks/
│   ├── banesco/
│   │   ├── auth/               # Authentication logic
│   │   ├── scrapers/           # Transaction/account scraping
│   │   ├── types/              # TypeScript types
│   │   └── examples/           # Usage examples
│   └── bnc/
│       ├── auth/
│       ├── scrapers/
│       ├── types/
│       └── examples/
└── shared/
    ├── base-bank-auth.ts       # Abstract auth base class
    ├── base-bank-scraper.ts    # Abstract scraper base class
    ├── performance-config.ts   # Performance presets
    └── utils/                  # Shared utilities
```

## Adding a New Bank

1. Create bank directory under `src/banks/{bank-name}/`
2. Extend `BaseBankAuth` for authentication
3. Extend `BaseBankScraper` for transaction extraction
4. Export from `src/banks/{bank-name}/index.ts`
5. Add to main `src/index.ts` exports

See [BASE_CLASS_SUMMARY.md](BASE_CLASS_SUMMARY.md) for detailed architecture docs.

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
