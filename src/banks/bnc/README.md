# BNC Client

Pure HTTP client for BNC (Banco Nacional de Crédito) online banking. No browser required - approximately 8-10x faster than browser-based scrapers.

## Overview

| Feature | Value |
|---------|-------|
| Auth Method | Card number + ID + Password |
| Transactions | Last 25 per account |
| Accounts | Up to 3 (VES and USD) |
| Browser Required | No (pure HTTP) |

### Limitations

- **Last 25 transactions only** - BNC API does not expose full history
- **Session conflicts** - If a session is already active, login may fail (use `logoutFirst: true`)

## Authentication

### Required Credentials

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Cédula de identidad (e.g., `V12345678`) |
| `cardNumber` | `string` | 16-digit card number |
| `password` | `string` | BNC online banking password |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `debug` | `boolean` | `false` | Enable debug logging |
| `logoutFirst` | `boolean` | `true` | Logout before login to clear existing sessions |

## Quickstart

### Basic Usage

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient({
  id: 'V12345678',
  cardNumber: '1234567890123456',
  password: 'your_password'
});

await client.login();
const result = await client.getTransactions();
console.log(`Found ${result.data?.length ?? 0} transactions`);
await client.close();
```

### With Configuration

```typescript
import { createBncClient } from '@danicanod/banker-venezuela/bnc';

const client = createBncClient(
  {
    id: 'V12345678',
    cardNumber: '1234567890123456',
    password: 'your_password'
  },
  {
    timeout: 60000,    // 60 seconds
    debug: true,       // Enable logging
    logoutFirst: true  // Clear existing sessions
  }
);
```

## Response Handling

### Login Result

```typescript
const loginResult = await client.login();

if (loginResult.success) {
  console.log('Logged in successfully');
} else {
  console.error('Login failed:', loginResult.message);
}
```

### Transactions Result

The `getTransactions()` method returns a `BncScrapingResult`:

```typescript
interface BncScrapingResult {
  success: boolean;
  message: string;
  data: BncTransaction[];
  bankName: 'BNC';
  timestamp: Date;
  accountsFound?: number;
  transactionsExtracted?: number;
}
```

### Processing Transactions

```typescript
const result = await client.getTransactions();

if (result.success && result.data) {
  for (const txn of result.data) {
    console.log({
      date: txn.date,
      amount: txn.amount,
      type: txn.type,           // 'credit' | 'debit'
      description: txn.description,
      reference: txn.referenceNumber,
      account: txn.accountName  // e.g., 'BNC VES 1109'
    });
  }
}
```

### Transaction Structure

```typescript
interface BncTransaction {
  date: string;              // ISO date string
  amount: number;            // Absolute value
  type: 'credit' | 'debit';
  description: string;
  referenceNumber?: string;
  accountName?: string;      // Account identifier
  transactionType?: string;  // BNC transaction type code
}
```

## Error Handling

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Not logged in. Call login() first.` | Called `getTransactions()` before `login()` | Call `login()` first |
| `Invalid credentials` | Wrong ID, card number, or password | Verify credentials |
| `Session already active` | Another session exists | Use `logoutFirst: true` (default) |
| `Request timeout` | Network issue or slow response | Increase `timeout` option |
| `ECONNREFUSED` | BNC servers unreachable | Check network connectivity |

### Handling Errors

```typescript
const loginResult = await client.login();

if (!loginResult.success) {
  if (loginResult.message.includes('credentials')) {
    console.error('Check your ID, card number, and password');
  } else if (loginResult.message.includes('Session')) {
    console.error('Session conflict - try again');
  } else {
    console.error('Login failed:', loginResult.message);
  }
  return;
}

const result = await client.getTransactions();

if (!result.success) {
  console.error('Failed to fetch transactions:', result.message);
  return;
}
```

## Security Notes

### Credential Handling

- **Never log raw credentials** - The client masks credentials in debug output
- **Use environment variables** - Never hardcode credentials in source files
- **Mask in application logs** - Display IDs as `V12***` and card numbers as `****1234`

### Example with Environment Variables

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient({
  id: process.env.BNC_ID!,
  cardNumber: process.env.BNC_CARD!,
  password: process.env.BNC_PASSWORD!
});
```

### Session Management

- Sessions are managed internally by the HTTP client
- No local session files are created
- Use `logoutFirst: true` to prevent session conflicts
- Always call `close()` when done (cleanup and state reset)

## Login Flow (Technical Details)

The BNC client performs a 4-step HTTP login:

1. **GET `/`** - Extract `__RequestVerificationToken` from the page
2. **POST `/Auth/PreLogin_Try`** - Submit card number + user ID
3. **POST `/Auth/Login_Try`** - Submit password
4. **GET `/Home/BNCNETHB/Welcome`** - Verify login success

All requests use cookie-based session management.

## Transaction IDs

Each transaction gets a deterministic ID for idempotent ingestion:

```
bnc-${sha256(date+amount+ref+desc+type+account).slice(0,16)}
```

This ensures:
- Same transaction always produces the same ID
- Duplicate ingestion attempts are skipped
- No collision between different transactions

---

**Navigation:**
- [Back to banks](../README.md)
- [Back to src](../../README.md)
- [Back to root](../../../README.md)
