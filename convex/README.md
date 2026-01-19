# Convex Backend (`convex/`)

Serverless backend for storing bank data and synchronizing with Notion. Handles transaction ingestion, event emission, and bidirectional Notion sync.

**Audience:** Contributors working on the backend, ops engineers managing syncs.

## For Library Users

If you're using `@danicanod/banker-venezuela` as a library, you don't need to understand this backend. See:
- [Root README](../README.md) for installation and quickstart
- [Library source](../src/README.md) for API documentation

## Table of Contents

- [Required Environment Variables](#required-environment-variables)
- [Data Model](#data-model)
- [Ingestion Flow](#ingestion-flow)
- [Notion Sync](#notion-sync)
- [Cron Jobs](#cron-jobs)
- [Operations](#operations)

## Required Environment Variables

Set these in the Convex Dashboard for deployed crons:

| Variable | Purpose |
|----------|---------|
| `BROWSERBASE_API_KEY` | Browserbase authentication |
| `BROWSERBASE_PROJECT_ID` | Browserbase project identifier |
| `BANESCO_USERNAME` | Banesco login username |
| `BANESCO_PASSWORD` | Banesco login password |
| `BANESCO_SECURITY_QUESTIONS` | Security question answers (`keyword:answer,...`) |
| `NOTION_API_TOKEN` | Notion API integration token |
| `NOTION_MOVIMIENTOS_DATABASE_ID` | Target Notion database for transactions |
| `NOTION_CARTERAS_BANESCO_PAGE_ID` | Banesco wallet page in Notion |
| `NOTION_CARTERAS_BNC_PAGE_ID` | BNC wallet page in Notion |

## Data Model

Schema defined in [`./schema.ts`](./schema.ts):

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `banks` | Bank accounts | `code` (indexed), `name`, `accountNumber`, `notionPageId` |
| `transactions` | Financial transactions | `txnKey` (indexed), `bankCode`, `date`, `amount`, `type`, `reference`, `notionPageId` |
| `events` | Audit trail | `type`, `transactionId`, `data` |
| `integration_state` | Sync cursors | `name` (indexed), `lastSyncAt`, `lastCursor` |

### Key Indexes

- `transactions.by_txnKey` - Idempotency checks
- `transactions.by_reference` - Movimientos matching
- `transactions.by_notionPageId` - Bidirectional sync lookups

## Ingestion Flow

Implemented in [`./transactions.ts`](./transactions.ts):

```
┌───────────────────────────────────────────────────────────┐
│                  ingest mutation                          │
├───────────────────────────────────────────────────────────┤
│  1. Generate txnKey = sha256(bankCode+date+amount+type+ref) │
│  2. Check if txnKey exists → skip if duplicate            │
│  3. Lookup/create bank by bankCode                        │
│  4. Insert transaction                                    │
│  5. Emit transaction.created event                        │
└───────────────────────────────────────────────────────────┘
```

**Idempotency guarantee**: Same transaction always produces same `txnKey`, preventing duplicates.

## Notion Sync

Two sync systems operate in parallel:

### Generic Sync

**Files:** [`./notion.ts`](./notion.ts), [`./notion_mutations.ts`](./notion_mutations.ts)

Syncs banks and transactions to general Notion databases.

| Direction | Behavior |
|-----------|----------|
| **Pull** (Notion → Convex) | Updates `category` field only |
| **Push** (Convex → Notion) | Creates/updates pages for all transactions |

Conflict resolution: **Last-write-wins** based on timestamps.

### Movimientos Sync

**Files:** [`./notion_movimientos.ts`](./notion_movimientos.ts), [`./notion_movimientos_mutations.ts`](./notion_movimientos_mutations.ts)

Specialized sync for the "Movimientos" database with financial tracking features.

**Matching strategy:**
1. Primary: Match by `Referencia` field (transaction reference number)
2. Fallback: Match by `date + amount + type` combination

**Property mapping:**

| Convex Field | Notion Property | Notes |
|--------------|-----------------|-------|
| `date` | `Fecha` | Date type |
| `description` | `Descripción` | Rich text (editable from Notion) |
| `amount` | `Débito` or `Crédito` | Based on transaction type |
| `reference` | `Referencia` | Primary matching key |
| `bankCode` | `Origen` or `Destino` | Relation to Banks database |
| `category` | `Categoría` | Rich text (editable from Notion) |

**Creation rules:**
- Only creates Notion pages for transactions WITH a `reference`
- Transactions without reference are synced if already linked

## Cron Jobs

Configured in [`./crons.ts`](./crons.ts):

| Job | Schedule | Description |
|-----|----------|-------------|
| `dailyBanescoSync` | `0 11 * * *` (11:00 UTC / 7:00 VE) | Scrape Banesco via Browserbase → ingest |
| `notionBidirectionalSync` | `*/15 * * * *` (every 15 min) | Pull from Notion, then push to Notion |

### Browserbase Sync

**File:** [`./sync.ts`](./sync.ts)

Uses Browserbase cloud browser service for headless Banesco scraping:

1. Connect to Browserbase session
2. Run Playwright login with credentials from env
3. Fetch accounts and movements
4. Ingest transactions to Convex
5. Close browser session

## Operations

### Cleanup Utility

**File:** [`./cleanup_movimientos.ts`](./cleanup_movimientos.ts)

Archives Notion pages for Banesco transactions missing reference numbers:

```bash
npx convex run cleanup_movimientos:cleanupBanescoMissingReferencia \
  '{"secret":"YOUR_SECRET","dryRun":true,"limit":100}'
```

**Safety features:**
- Only processes transactions with stored `notionPageId`
- Double-checks Notion page before archiving
- Skips if user manually added a reference
- Supports `dryRun` mode

---

**Navigation:**
- [Back to root](../README.md)
- [Local sync scripts](../scripts/README.md)
- [Library source](../src/README.md)
