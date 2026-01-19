# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

A TypeScript library for programmatic access to Venezuelan bank accounts.

[Installation](#installation) • [Quick Start](#quick-start) • [API](#api-entry-points) • [Setup](#setup) • [Commands](#commands)

</div>

---

## Supported Banks

| Bank | Authentication | Transactions |
|------|----------------|--------------|
| Banesco | Username + Password + Security Questions | Full history |
| BNC | Card + ID + Password | Last 25 |

## Why Use This

- **Automate bank data retrieval** - Fetch account balances and transaction history programmatically
- **Type-safe API** - Full TypeScript support with typed responses and configuration
- **Notion integration** - Sync transactions to Notion databases via Convex scheduled jobs
- **Flexible architecture** - Use as a library or run the included sync scripts

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

## API Entry Points

| Import Path | Description |
|-------------|-------------|
| `@danicanod/banker-venezuela` | Main exports: `createBanescoClient`, `createBncClient` |
| `@danicanod/banker-venezuela/banesco` | Banesco-specific client and types |
| `@danicanod/banker-venezuela/bnc` | BNC-specific client and types |

See [src/README.md](src/README.md) for detailed API documentation.

## Setup

Create a `.env` file for local development. For deployed crons, set secrets in the Convex Dashboard.

### Bank Credentials

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

### Convex Integration

```bash
# Local scripts
CONVEX_URL=https://your-deployment.convex.cloud

# Deployed crons (set in Convex Dashboard)
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
NOTION_API_TOKEN=secret_xxx
NOTION_MOVIMIENTOS_DATABASE_ID=your_database_id
NOTION_CARTERAS_BANESCO_PAGE_ID=your_page_id
NOTION_CARTERAS_BNC_PAGE_ID=your_page_id
```

## Sync

### Automatic (Crons)

| Job | Schedule | Description |
|-----|----------|-------------|
| `sync-banesco-transactions` | Daily 07:00 VE | Scrape Banesco via Browserbase |
| `sync-notion-bidirectional` | Every 15 min | Sync with Notion databases |

Deploy to enable:

```bash
npx convex deploy
```

### Manual

```bash
npm run sync:banesco    # Sync Banesco transactions
npm run sync:bnc        # Sync BNC transactions
```

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Build the project |
| `npm run type-check` | Check TypeScript types |
| `npm run test` | Run test suite |
| `npm run sync:banesco` | Sync Banesco transactions locally |
| `npm run sync:bnc` | Sync BNC transactions locally |
| `npx convex dev` | Start local Convex dev server |
| `npx convex deploy` | Deploy backend to production |

## Security

### Credentials

- Never commit `.env` files or any file containing secrets
- Use environment variables locally; use the Convex Dashboard for deployed secrets
- Mask sensitive values in logs (e.g., `V12***` instead of full ID)

### Sessions

- Session data is stored in `.sessions/` (gitignored)
- Sessions expire after 24 hours
- All bank connections use HTTPS

### Before Deploying

- [ ] Secrets stored in environment variables or Convex Dashboard
- [ ] `.env` excluded via `.gitignore`
- [ ] Logs do not expose passwords or tokens

### Vulnerability Reporting

Email danicanod@gmail.com. Do not open public issues for security vulnerabilities.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

Made for the Venezuelan developer community

</div>
