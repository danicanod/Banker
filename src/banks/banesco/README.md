# Banesco Client

Hybrid client for Banco Universal Banesco.

## Architecture

- **Playwright** for login (handles JS, iframes, security questions)
- **HTTP** for data fetching (faster, more stable after login)

## Usage

### Recommended: BanescoClient

```typescript
import { createBanescoClient } from '@danicanod/banker-venezuela/banesco';

const client = createBanescoClient({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'keyword1:answer1,keyword2:answer2'
});

// Login (Playwright handles iframes and security questions)
await client.login();

// Fetch data (HTTP - fast and stable)
const accounts = await client.getAccounts();
const movements = await client.getAccountMovements(accounts.accounts[0].accountNumber);

// Cleanup
await client.close();
```

### Advanced: Step-by-step Hybrid

```typescript
import { BanescoAuth } from '@danicanod/banker-venezuela/banesco';
import { BanescoHttpClient } from '@danicanod/banker-venezuela/banesco';

// Step 1: Login with Playwright
const auth = new BanescoAuth(credentials, { headless: true });
await auth.login();

// Step 2: Extract cookies
const cookies = await auth.getPage()?.context().cookies();

// Step 3: Create HTTP client with cookies
const http = new BanescoHttpClient(credentials, { skipLogin: true });
http.importCookiesFromPlaywright(cookies);

// Step 4: Fetch data via HTTP
const accounts = await http.getAccounts();
const movements = await http.getAccountMovements(accountNumber);

// Step 5: Cleanup
await auth.close();
```

## Configuration

```typescript
interface BanescoClientConfig {
  headless?: boolean;   // Default: true (run browser in headless mode)
  timeout?: number;     // Default: 60000ms (login timeout)
  debug?: boolean;      // Default: false (enable verbose logging)
}
```

## Security Questions

Format: `keyword1:answer1,keyword2:answer2`

The system matches keywords (case-insensitive) against question text.

Example:
```bash
BANESCO_SECURITY_QUESTIONS=anime:Naruto,mascota:Firulais,madre:Maria
```

If login fails with "no_keyword_match", check the log for the actual question text and add the right keyword.

## File Structure

```
banesco/
├── client.ts           # BanescoClient (recommended entry point)
├── auth/
│   ├── banesco-auth.ts        # Playwright-based login
│   └── security-questions.ts  # Security question handler
├── http/
│   ├── banesco-http-client.ts # HTTP client for data fetch
│   └── form-parser.ts         # ASP.NET form parsing
├── types/
│   └── index.ts               # TypeScript types
├── examples/
│   ├── basic-usage.ts         # Basic BanescoClient example
│   └── hybrid-usage.ts        # Step-by-step hybrid example
└── README.md
```

---

**Navigation:**
- [Back to banks overview](../README.md)
- [BNC client](../bnc/README.md)
- [Shared utilities](../../shared/README.md)
- [Root README](../../../README.md)
