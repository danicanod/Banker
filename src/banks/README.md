# Bank Implementations (`src/banks/`)

This directory contains bank-specific client implementations. Each bank has its own subdirectory with authentication logic, HTTP clients, types, and examples.

## Table of Contents

- [Bank Comparison](#bank-comparison)
- [Architecture Patterns](#architecture-patterns)
- [Adding a New Bank](#adding-a-new-bank)

## Bank Comparison

| Feature | [Banesco](./banesco/README.md) | [BNC](./bnc/README.md) |
|---------|---------|-----|
| **Mode** | Hybrid (Playwright + HTTP) | Pure HTTP |
| **Login** | Browser required (iframes, JS) | HTTP requests only |
| **Speed** | ~15-30s login, fast fetch | ~2-3s total |
| **Auth** | Username + Password + Security Questions | Card + ID + Password |
| **Transactions** | Full history available | Last 25 only |
| **Browser Needed** | Yes (for login only) | No |

## Architecture Patterns

### Hybrid Pattern (Banesco)

```
┌─────────────────────────────────────────────────┐
│                  BanescoClient                  │
├────────────────────┬────────────────────────────┤
│   BanescoAuth      │   BanescoHttpClient        │
│   (Playwright)     │   (pure HTTP)              │
│                    │                            │
│   - Login          │   - getAccounts()          │
│   - Security Qs    │   - getAccountMovements()  │
│   - Extract cookies│   - Import cookies         │
└────────────────────┴────────────────────────────┘
```

Used when the bank requires JavaScript/iframes for login but HTTP works for data fetching.

### Pure HTTP Pattern (BNC)

```
┌─────────────────────────────────────────────────┐
│                   BncClient                     │
├─────────────────────────────────────────────────┤
│               BncHttpClient                     │
│                                                 │
│   - login()                                     │
│   - fetchLast25Transactions()                   │
│   - Cookie jar session management               │
└─────────────────────────────────────────────────┘
```

Used when the bank's login and data APIs work with plain HTTP requests.

## Adding a New Bank

1. Create a new directory: `src/banks/<bankname>/`
2. Implement the client following existing patterns:
   - `client.ts` - Main client class with `createXxxClient()` factory
   - `types/index.ts` - TypeScript types extending base types from [`../shared/types/`](../shared/types/)
   - `http/` - HTTP client implementation
   - `auth/` - (if needed) Playwright-based auth
   - `README.md` - Bank-specific documentation
3. Export from [`../index.ts`](../index.ts)
4. Add to the comparison table above

---

**Navigation:**
- [Back to src](../README.md)
- [Banesco client](./banesco/README.md)
- [BNC client](./bnc/README.md)
- [Shared utilities](../shared/README.md)
