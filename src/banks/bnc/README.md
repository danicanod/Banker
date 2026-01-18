# BNC Client

Pure HTTP client for Banco Nacional de Crédito (BNC).

## Architecture

No browser automation needed - uses direct HTTP requests for authentication and data fetching. This is ~8-10x faster than browser-based scrapers.

## Usage

### Recommended: BncClient

```typescript
import { createBncClient } from '@danicanod/banker-venezuela/bnc';

const client = createBncClient({
  id: 'V12345678',
  cardNumber: '1234567890123456',
  password: 'your_password'
});

// Login (pure HTTP)
await client.login();

// Fetch transactions (pure HTTP)
const result = await client.getTransactions();
console.log(result.data);

// Cleanup
await client.close();
```

### Quick One-liner

```typescript
import { quickHttpScrape } from '@danicanod/banker-venezuela/bnc';

const result = await quickHttpScrape({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});

console.log(result.data);
```

### Advanced: Direct HTTP Client

```typescript
import { createBncHttpClient } from '@danicanod/banker-venezuela/bnc';

const client = createBncHttpClient(credentials, { debug: true });

const loginResult = await client.login();
if (loginResult.success) {
  const transactions = await client.fetchLast25Transactions();
  console.log(transactions.data);
}

await client.reset();
```

## Configuration

```typescript
interface BncClientConfig {
  timeout?: number;      // Default: 30000ms
  debug?: boolean;       // Default: false (enable verbose logging)
  logoutFirst?: boolean; // Default: true (clear existing sessions before login)
}
```

## File Structure

```
bnc/
├── client.ts           # BncClient (recommended entry point)
├── http/
│   ├── bnc-http-client.ts # HTTP client (auth + data fetch)
│   └── index.ts           # HTTP exports
├── types/
│   └── index.ts           # TypeScript types
├── examples/
│   └── http-usage.ts      # Usage examples
└── README.md
```
