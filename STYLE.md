# Code Style Guide

This document describes the logging and comment conventions for this codebase.

## Logging

### When to log

- **Info**: Major lifecycle events (login started, login completed, session closed)
- **Warn**: Recoverable issues (retry attempt, fallback used)
- **Error**: Failures that need attention
- **Debug**: Detailed flow information (only shown when debug mode is on)

### What to include

- Component name in brackets: `[BanescoClient]`
- Short action description: `login started`, `fetching transactions`
- Relevant IDs (masked): `user=V12***`, `account=***1234`
- Duration when measuring performance: `(1234ms)`

### What NOT to include

- Emojis in log output
- Long ASCII banners or separators
- Secrets, passwords, or full tokens
- Verbose stack traces in production

### Format

```
timestamp level [component] message (optional data)
```

Example output:
```
12:34:56.789 info  [BanescoClient] login started
12:34:58.123 info  [BanescoClient] login completed (1334ms)
12:34:58.456 debug [BanescoHttpClient] fetching accounts
```

## Comments

### Good comments (why/constraints)

```typescript
// Banesco requires iframe navigation; direct fetch doesn't work
// Retry with exponential backoff to handle rate limiting
// ASP.NET postback requires these hidden fields
```

### Avoid

```typescript
// ============================================
// This section handles the login flow
// ============================================

// Loop through the array
for (const item of items) { ... }

// Set the variable to true
isLoggedIn = true;
```

## Naming

- **Variables/functions**: `camelCase`
- **Classes/types**: `PascalCase`
- **Constants**: `camelCase` or `UPPER_CASE` for true constants
- **Enum members**: `PascalCase`
- **Files**: `kebab-case.ts`

## TypeScript

- Prefer `unknown` over `any` when type is uncertain
- Use `const` by default, `let` only when reassignment is needed
- Prefix unused parameters with `_` or omit from catch blocks
