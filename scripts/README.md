# Sync Scripts (`scripts/`)

Local scripts for syncing bank transactions to the Convex backend. Run these manually or via npm scripts.

**Audience:** Developers running local syncs or debugging the sync pipeline.

## Table of Contents

- [Quickstart](#quickstart)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Shared Utilities](#shared-utilities)
- [Output Format](#output-format)
- [Troubleshooting](#troubleshooting)

## Quickstart

1. Copy `env.example` to `.env` and fill in your credentials
2. Ensure Convex is deployed: `npx convex deploy`
3. Run a sync:

```bash
npm run sync:banesco    # Sync Banesco transactions
npm run sync:bnc        # Sync BNC transactions
```

## Available Scripts

### Banesco Sync

**File:** [`./banesco-sync.ts`](./banesco-sync.ts)

Syncs Banesco transactions to Convex using the hybrid client (Playwright + HTTP).

```bash
npm run sync:banesco
```

**Flow:**
1. Load credentials from environment
2. Login via Playwright (handles iframes, security questions)
3. Fetch accounts and movements via HTTP
4. Ingest transactions to Convex (idempotent)
5. Report created/skipped counts

### BNC Sync

**File:** [`./bnc-sync.ts`](./bnc-sync.ts)

Syncs BNC transactions to Convex using pure HTTP (no browser).

```bash
npm run sync:bnc
```

**Flow:**
1. Load credentials from environment
2. Login via HTTP (no browser)
3. Fetch last 25 transactions per account
4. Ingest transactions to Convex (idempotent)
5. Report created/skipped counts

## Environment Variables

Required in `.env`:

```bash
# Banesco credentials
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS=keyword1:answer1,keyword2:answer2

# BNC credentials
BNC_ID=V12345678
BNC_CARD=1234567890123456
BNC_PASSWORD=your_password

# Convex deployment
CONVEX_URL=https://your-deployment.convex.cloud
```

## Shared Utilities

**File:** [`./_sync-utils.ts`](./_sync-utils.ts)

Common helpers used by all sync scripts:

| Function | Description |
|----------|-------------|
| `loadEnv()` | Load `.env` file |
| `requireEnv(name)` | Get env var or throw |
| `filterConsoleLogs(debug)` | Suppress noisy Playwright logs |
| `generateTxnKey(bankCode, txn)` | Deterministic transaction key (SHA-256) |
| `previewTransactions(txns)` | Pretty-print transaction summary |
| `ingestToConvex(convexUrl, txns)` | POST transactions to Convex |

### Transaction Key Generation

Keys are deterministic SHA-256 hashes for idempotency:

```typescript
const key = generateTxnKey('banesco', {
  date: '2025-01-15',
  amount: 100.50,
  type: 'debit',
  reference: '123456789'
});
// Returns: 'a1b2c3d4e5f6...' (32 hex chars)
```

This ensures:
- Same transaction always produces the same key
- Duplicate ingestion attempts are skipped
- No collision between different transactions

## Output Format

Successful sync output:

```
[Sync] Starting Banesco sync...
[Sync] Login successful
[Sync] Found 2 accounts
[Sync] Fetching movements for 0134-1234-56-7890123456
[Sync] Found 15 transactions
[Sync] Ingesting to Convex...
[Sync] Created: 12, Skipped: 3
[Sync] Done in 18.5s
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `CONVEX_URL is required` | Missing environment variable | Add `CONVEX_URL` to your `.env` file |
| `Login failed: Invalid credentials` | Wrong username/password | Verify credentials match your bank account |
| `Security question not found` | Missing security question answer | Add the keyword:answer pair to `BANESCO_SECURITY_QUESTIONS` |
| `ECONNREFUSED` | Convex not running | Run `npx convex dev` or deploy with `npx convex deploy` |
| `Timeout waiting for element` | Bank site changed or slow | Retry; if persistent, check for site updates |
| `Browser closed unexpectedly` | Playwright crash | Ensure Chromium is installed: `npx playwright install chromium` |

---

**Navigation:**
- [Back to root](../README.md)
- [Convex backend](../convex/README.md)
- [Library source](../src/README.md)
