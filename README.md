# Banker Venezuela

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

A TypeScript library for programmatic access to Venezuelan bank accounts.

[Installation](#installation) • [Quick Start](#quick-start) • [Setup](#setup) • [Sync](#sync)

</div>

---

## Supported Banks

| Bank | Authentication | Transactions |
|------|---------------|--------------|
| Banesco | Username + Password + Security Questions | Full history |
| BNC | Card + ID + Password | Last 25 |

## Overview

This library provides typed clients for authenticating with Venezuelan banks and fetching account data.

- Retrieve account balances and transaction history programmatically
- Optionally sync transactions to Notion via Convex scheduled jobs

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

Authenticate, then fetch accounts and movements.

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

Authenticate, then fetch the last 25 transactions.

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

Create a `.env` file for local development. For deployed crons, set secrets in the Convex Dashboard instead.

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

After deploying to Convex, these crons run on schedule:

| Cron Job | Schedule |
|----------|----------|
| `sync-banesco-transactions` | Daily 07:00 VE |
| `sync-notion-bidirectional` | Every 15 min |

```bash
npx convex deploy
```

### Manual

Run sync scripts locally when needed:

```bash
npm run sync:banesco
npm run sync:bnc
```

## Commands

| Command | Description |
|---------|-------------|
| `npx convex deploy` | Deploy backend to production |
| `npx convex dev` | Start local Convex dev server |
| `npm run sync:banesco` | Sync Banesco transactions locally |
| `npm run sync:bnc` | Sync BNC transactions locally |
| `npm run test` | Run test suite |
| `npm run type-check` | Check TypeScript types |

## Development

```bash
npm install
npm run type-check
npm run build
```

## Security

### Credentials

- Never commit `.env` files or any file containing secrets
- Use environment variables locally; use the Convex Dashboard for deployed secrets
- Mask sensitive values in logs (e.g., `V12***` instead of full ID)

### Sessions

- Session data is stored in `.sessions/` (gitignored)
- Sessions expire after 24 hours
- All bank connections use HTTPS

### Checklist

Before deploying:

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
