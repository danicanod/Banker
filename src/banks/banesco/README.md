# Banesco Bank Scraper

Hybrid scraper for Banesco online banking: Playwright handles login (iframes + security questions), then HTTP is used for fast data fetching.

## Quick Start

### Using the Scraper Class

```typescript
import { BanescoScraper } from '@danicanod/banker-venezuela/banesco';

const scraper = new BanescoScraper({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'madre:maria,colegio:central,mascota:firulais'
}, { headless: true, debug: true });

const session = await scraper.scrapeAll();
console.log(`Auth: ${session.authResult.success}`);
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

await scraper.close();
```

### Quick Scrape (One-liner)

```typescript
import { quickScrapeBanesco } from '@danicanod/banker-venezuela';

const transactions = await quickScrapeBanesco({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'madre:maria,colegio:central'
}, { debug: true });

console.log(`Found ${transactions.length} transactions`);
```

### Lower-level: Auth + HTTP Client

```typescript
import { BanescoAuth, BanescoHttpClient } from '@danicanod/banker-venezuela/banesco';

const auth = new BanescoAuth(credentials, { headless: true });
const result = await auth.login();

if (result.success) {
  const page = auth.getPage();
  const cookies = await page.context().cookies();

  const http = new BanescoHttpClient(credentials, { skipLogin: true });
  http.importCookiesFromPlaywright(cookies);

  const accounts = await http.getAccounts();
  console.log(accounts);
}

await auth.close();
```

## Security Questions

Banesco requires security questions during login. Configure them as comma-separated `keyword:answer` pairs:

```typescript
const securityQuestions = 'madre:maria,colegio:central,mascota:firulais';
```

The handler matches keywords against question text (case-insensitive). Common keywords:

| Keyword | Matches questions like |
|---------|------------------------|
| `madre` | "¿Cuál es el nombre de tu madre?" |
| `padre` | "¿Cuál es el nombre de tu padre?" |
| `colegio` | "¿En qué colegio estudiaste?" |
| `mascota` | "¿Cuál es el nombre de tu mascota?" |
| `color` | "¿Cuál es tu color favorito?" |
| `ciudad` | "¿En qué ciudad naciste?" |
| `anime` | "¿Cuál es tu anime favorito?" |

## Configuration

### Auth Config

```typescript
interface BanescoAuthConfig {
  headless?: boolean;      // Default: false
  timeout?: number;        // Default: 30000ms
  debug?: boolean;         // Default: false
  saveSession?: boolean;   // Default: true
  retries?: number;        // Default: 3
}
```

### Scraping Config

```typescript
interface BanescoScrapingConfig {
  debug?: boolean;              // Default: false
  timeout?: number;             // Default: 30000ms
  waitBetweenActions?: number;  // Default: 1000ms
  retries?: number;             // Default: 3
  saveHtml?: boolean;           // Default: false (save HTML for debugging)
}
```

### Performance Presets

| Preset | Description |
|--------|-------------|
| `MAXIMUM` | Blocks everything except essential functionality |
| `AGGRESSIVE` | Blocks most resources, keeps essential JS |
| `BALANCED` | Keeps CSS for visual feedback |
| `CONSERVATIVE` | Minimal blocking |
| `NONE` | No blocking (for debugging) |

```typescript
const scraper = new BanescoScraper(credentials, {
  performancePreset: 'AGGRESSIVE'
});
```

## API Reference

### BanescoScraper

```typescript
class BanescoScraper {
  constructor(credentials: BanescoCredentials, config?: BanescoFullScrapingConfig)

  // Full session (auth + transactions)
  scrapeAll(): Promise<BanescoScrapingSession>

  // Individual operations
  authenticate(): Promise<BanescoLoginResult>
  scrapeTransactions(): Promise<BanescoScrapingResult>

  // Status
  isAuthenticated(): boolean
  getPage(): Page | null
  getBrowser(): Browser | null

  // Session management
  exportSession(session: BanescoScrapingSession, filename?: string): string
  close(): Promise<void>
}
```

### Factory Functions

```typescript
function createBanescoScraper(
  credentials: BanescoCredentials,
  config?: BanescoFullScrapingConfig
): BanescoScraper

async function quickScrape(
  credentials: BanescoCredentials,
  config?: Partial<BanescoFullScrapingConfig>
): Promise<BanescoTransaction[]>
```

## Error Handling

```typescript
const result = await scraper.authenticate();

if (!result.success) {
  switch (result.error) {
    case 'INVALID_CREDENTIALS':
      console.log('Check username/password');
      break;
    case 'SECURITY_QUESTIONS_FAILED':
      console.log('Check security questions format: "keyword:answer,..."');
      break;
    case 'SYSTEM_UNAVAILABLE':
      console.log('Banesco system temporarily unavailable');
      break;
    case 'IFRAME_NAVIGATION_FAILED':
      console.log('Iframe navigation failed');
      break;
  }
}
```

## Session Persistence

The optimized login flow stores browser sessions under `.sessions/` (in the current working directory). Sessions expire after 24 hours. When a valid session exists, security questions are skipped on subsequent logins.

## File Structure

```
src/banks/banesco/
├── auth/
│   ├── banesco-auth.ts       # Main auth implementation
│   ├── optimized-login.ts    # Session-aware login with cookie persistence
│   └── security-questions.ts # Security question handler
├── http/
│   └── ...                   # HTTP client for data fetching
├── scrapers/
│   ├── banesco-scraper.ts    # Main scraper class
│   ├── transactions.ts       # Transaction scraper
│   └── accounts.ts           # Account scraper
├── types/
│   └── index.ts              # TypeScript types
└── examples/
    └── ...                   # Usage examples
```

## See Also

- [Main README](../../../README.md) – Installation and overview
- [BNC documentation](../bnc/README.md) – HTTP-only alternative
