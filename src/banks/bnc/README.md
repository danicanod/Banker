# 🏦 BNC Bank Scraper (HTTP-Only)

Pure HTTP-based scraper for BNC online banking. No browser automation required - provides ~8-10x faster performance.

## 🏗️ Architecture

```typescript
// Main scraper (HTTP-based wrapper)
export class BncScraper

// Low-level HTTP client
export class BncHttpClient
```

## 📁 Structure

```
src/banks/bnc/
├── http/
│   ├── index.ts            # HTTP module exports
│   └── bnc-http-client.ts  # Main HTTP client with auth + transactions
├── scrapers/
│   └── bnc-scraper.ts      # HTTP-based scraper wrapper
├── types/
│   └── index.ts            # Bank-specific types
├── examples/
│   └── http-usage.ts       # Usage examples
├── index.ts                # Module exports
└── README.md               # This documentation
```

## 🚀 Quick Start

### Simple Usage with Factory Function

```typescript
import { quickScrape } from '@danicanod/banker-venezuela/bnc';

// One-liner for quick transactions
const transactions = await quickScrape({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
}, { debug: true });

console.log(`Found ${transactions.length} transactions`);
```

### Full Session Control

```typescript
import { BncScraper, createBncScraper } from '@danicanod/banker-venezuela/bnc';

// Factory method
const scraper = createBncScraper({
  id: 'V12345678',
  card: '1234567890123456', 
  password: 'your_password'
}, { debug: true });

// Full scraping session
const session = await scraper.scrapeAll();
console.log(`Authentication: ${session.authResult.success}`);
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);
```

### Direct HTTP Client Usage

```typescript
import { createBncHttpClient } from '@danicanod/banker-venezuela/bnc';

const client = createBncHttpClient({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
}, { debug: true });

const loginResult = await client.login();
if (loginResult.success) {
  const transactions = await client.fetchLast25Transactions();
  console.log(transactions.data);
}

await client.reset();
```

## 🔐 3-Step Authentication Process

BNC uses a 3-step HTTP authentication:

1. **Card Number + User ID**: Submit to `/Auth/PreLogin_Try`
2. **Password**: Submit to `/Auth/Login_Try`  
3. **Verify**: Check login via `/Home/BNCNETHB/Welcome`

```typescript
interface BncCredentials {
  id: string;        // Cédula de identidad (V12345678)
  card: string;      // BNC card number (16 digits)
  password: string;  // Online banking password
}
```

## 🏦 Multi-Account Support

BNC scraper automatically detects and processes all account types:

- **VES_1109**: Venezuelan Bolívar savings accounts
- **USD_0816**: US Dollar accounts (standard type)
- **USD_0801**: US Dollar accounts (alternative type)

## ⚙️ Configuration Options

```typescript
interface BncConfig {
  timeout?: number;             // Default: 30000ms
  debug?: boolean;              // Default: false
  closeAfterScraping?: boolean; // Default: true
  logoutFirst?: boolean;        // Default: true (clears existing sessions)
}
```

## 📝 Environment Variables

```bash
# .env file
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password

# Optional debugging
BNC_DEBUG=true
```

## 🔧 API Reference

### Main Scraper API

```typescript
class BncScraper {
  // Full session (auth + transactions)
  async scrapeAll(): Promise<BncScrapingSession>
  
  // Status
  isAuthenticated(): boolean
  getUsedMethod(): 'http'
  
  // Session management
  exportSession(session: BncScrapingSession): string
  async close(): Promise<void>
}
```

### HTTP Client API

```typescript
class BncHttpClient {
  // Authentication
  async login(): Promise<BncHttpLoginResult>
  async logout(): Promise<{ success: boolean; message: string }>
  isLoggedIn(): boolean
  
  // Transactions
  async fetchLast25Transactions(): Promise<BncScrapingResult>
  
  // Cleanup
  async reset(): Promise<void>
}
```

### Factory Functions

```typescript
// Quick scrape function
async function quickScrape(
  credentials: BncCredentials, 
  config?: BncConfig
): Promise<BncTransaction[]>

// Scraper factory
function createBncScraper(
  credentials: BncCredentials,
  config?: BncConfig
): BncScraper

// HTTP client factory
function createBncHttpClient(
  credentials: BncCredentials,
  config?: BncHttpConfig
): BncHttpClient
```

## 🧪 Testing & Development

### Running Examples

```bash
# Run example
npm run example:bnc

# With debug output
BNC_DEBUG=true npm run example:bnc
```

### Performance

| Metric | HTTP Mode |
|--------|-----------|
| Login + Transactions | ~2 seconds |
| Transactions only | ~1 second |

## ⚠️ Known Issues

### Session Conflicts

BNC tracks sessions server-side by user ID:

```
"Existe una sesión previa activa, la nueva sesión ha sido denegada"
```

- Sessions last ~5-10 minutes after last activity
- HTTP client has `logoutFirst: true` by default to mitigate this
- Wait 5+ minutes between test runs if you encounter this

## 📚 Documentation

- 🏦 **[Banesco README](../banesco/README.md)** - Sister implementation (hybrid mode)
- 📖 **[Main README](../../../README.md)** - Full library documentation

---

**Part of the Banker Venezuela banking automation library.**
