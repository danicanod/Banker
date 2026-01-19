# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**TypeScript library for connecting to Venezuelan bank accounts**

[Installation](#installation) • [Quick Start](#quick-start) • [Setup](#setup) • [Sync](#sync)

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

## Setup

Create a `.env` file based on `env.example`:

```bash
# Bank credentials
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password

# Convex (local scripts)
CONVEX_URL=https://your-deployment.convex.cloud

# Convex Dashboard (for deployed crons)
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
NOTION_API_TOKEN=secret_xxx
NOTION_MOVIMIENTOS_DATABASE_ID=your_database_id
NOTION_CARTERAS_BANESCO_PAGE_ID=your_page_id
NOTION_CARTERAS_BNC_PAGE_ID=your_page_id
```

## Sync

### Automatic

Convex crons sync automatically once deployed:

| Cron Job | Schedule |
|----------|----------|
| `sync-banesco-transactions` | Daily 07:00 VE |
| `sync-notion-bidirectional` | Every 15 min |

```bash
npx convex deploy
```

### Manual

```bash
npm run sync:banesco
npm run sync:bnc
```

## Commands

| Command | Description |
|---------|-------------|
| `npx convex deploy` | Deploy to production |
| `npx convex dev` | Start local dev server |
| `npm run sync:banesco` | Sync Banesco |
| `npm run sync:bnc` | Sync BNC |
| `npm run test` | Run tests |
| `npm run type-check` | Type check |

## Development

```bash
npm install
npm run type-check
npm run build
```

## Security

- Never commit `.env` files or credentials
- Store secrets in environment variables or Convex Dashboard
- Sessions stored in `.sessions/` (gitignored, 24h expiry)
- All bank connections use HTTPS
- Never log passwords, tokens, or full credentials

**Vulnerability reporting:** Email danicanod@gmail.com (do not open public issues)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made for the Venezuelan developer community**

</div>
