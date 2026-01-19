# Library Source (`src/`)

TypeScript library for connecting to Venezuelan bank accounts. Provides unified clients for Banesco and BNC with type-safe APIs.

**Audience:** Library consumers and contributors exploring the source code.

## Table of Contents

- [Public API](#public-api)
- [Supported Banks](#supported-banks)
- [Import Paths](#import-paths)
- [Compatibility](#compatibility)
- [Directory Structure](#directory-structure)

## Public API

The library exports two main client factories from [`./index.ts`](./index.ts):

| Export | Description |
|--------|-------------|
| `createBanescoClient()` | Hybrid client: Playwright login + HTTP data fetch |
| `createBncClient()` | Pure HTTP client: no browser needed |

## Supported Banks

| Bank | Client Type | Transactions | Documentation |
|------|-------------|--------------|---------------|
| Banesco | Hybrid (Playwright + HTTP) | Full history | [Banesco README](./banks/banesco/README.md) |
| BNC | Pure HTTP | Last 25 | [BNC README](./banks/bnc/README.md) |

## Import Paths

### Root Import

All exports are available from the package root:

```typescript
import { createBanescoClient, createBncClient } from '@danicanod/banker-venezuela';
```

### Bank-Specific Imports

Import bank-specific modules for additional types and utilities:

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela/banesco';
import type { BanescoConfig, BanescoTransaction } from '@danicanod/banker-venezuela/banesco';

import { createBncClient } from '@danicanod/banker-venezuela/bnc';
import type { BncConfig, BncTransaction } from '@danicanod/banker-venezuela/bnc';
```

## Compatibility

| Requirement | Version |
|-------------|---------|
| Node.js | >= 18 |
| TypeScript | >= 5.0 |
| npm | >= 8 |

The Banesco client requires Playwright Chromium, which is installed automatically via the package's postinstall script.

See the [root README](../README.md) for full installation instructions.

## Directory Structure

```
src/
├── index.ts              # Main exports (createBanescoClient, createBncClient)
├── banks/                # Bank-specific implementations
│   ├── banesco/          # Banesco hybrid client (Playwright + HTTP)
│   └── bnc/              # BNC pure HTTP client
├── shared/               # Shared utilities and base classes
└── dev/                  # Development/debug tools (not exported)
```

---

**Navigation:**
- [Back to root](../README.md)
- [Banks overview](./banks/README.md)
- [Shared utilities](./shared/README.md)
- [Dev tools](./dev/README.md)
