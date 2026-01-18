# Library Source (`src/`)

TypeScript library for connecting to Venezuelan bank accounts. Provides unified clients for Banesco and BNC with type-safe APIs.

## Table of Contents

- [Public API](#public-api)
- [Supported Banks](#supported-banks)
- [Entry Point](#entry-point)
- [Directory Structure](#directory-structure)

## Public API

The library exports two main client factories from [`./index.ts`](./index.ts):

| Export | Description |
|--------|-------------|
| `createBanescoClient()` | Hybrid client: Playwright login + HTTP data fetch |
| `createBncClient()` | Pure HTTP client: no browser needed |

Advanced exports for lower-level access:

| Export | Description |
|--------|-------------|
| `BanescoAuth` | Playwright-based authentication class |
| `BanescoHttpClient` | HTTP client for post-login data fetching |
| `BncHttpClient` | Pure HTTP client for BNC |
| `quickHttpScrape` | One-liner for BNC login + fetch |

## Supported Banks

| Bank | Mode | Speed | Transactions |
|------|------|-------|--------------|
| [Banesco](./banks/banesco/README.md) | Hybrid (Playwright + HTTP) | Fast after login | Full history |
| [BNC](./banks/bnc/README.md) | Pure HTTP | ~8-10x faster | Last 25 only |

## Entry Point

All exports are available from the package root:

```typescript
import { createBanescoClient, createBncClient } from '@danicanod/banker-venezuela';
```

Or import bank-specific modules directly:

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela/banesco';
import { createBncClient } from '@danicanod/banker-venezuela/bnc';
```

## Directory Structure

```
src/
├── index.ts              # Main exports (see above)
├── banks/                # Bank-specific implementations
│   ├── banesco/          # Banesco hybrid client
│   └── bnc/              # BNC pure HTTP client
├── shared/               # Shared utilities and base classes
└── dev/                  # Development/debug tools (not part of library)
```

---

**Navigation:**
- [Back to root](../README.md)
- [Banks overview](./banks/README.md)
- [Shared utilities](./shared/README.md)
- [Dev tools](./dev/README.md)
