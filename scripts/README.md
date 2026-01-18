# Sync Scripts (`scripts/`)

Local scripts for syncing bank transactions to the Convex backend. Run these manually or via npm scripts.

## Table of Contents

- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Shared Utilities](#shared-utilities)
- [Output Format](#output-format)

## Available Scripts

### Banesco Sync ([`./banesco-sync.ts`](./banesco-sync.ts))

Syncs Banesco transactions to Convex using the hybrid client.

```bash
npm run sync:banesco
# or
npm run sync
```

Flow:
1. Load credentials from environment
2. Login via Playwright (handles iframes, security questions)
3. Fetch accounts and movements via HTTP
4. Ingest transactions to Convex (idempotent)
5. Report created/skipped counts

### BNC Sync ([`./bnc-sync.ts`](./bnc-sync.ts))

Syncs BNC transactions to Convex using pure HTTP.

```bash
npm run sync:bnc
```

Flow:
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

### _sync-utils.ts ([`./_sync-utils.ts`](./_sync-utils.ts))

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

---

**Navigation:**
- [Back to root](../README.md)
- [Convex backend](../convex/README.md)
- [Library source](../src/README.md)
