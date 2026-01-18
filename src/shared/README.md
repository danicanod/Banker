# Shared Utilities (`src/shared/`)

Common infrastructure used by all bank implementations. Provides base classes, HTTP utilities, and performance configurations.

## Table of Contents

- [Base Classes](#base-classes)
- [HTTP Utilities](#http-utilities)
- [Performance Configuration](#performance-configuration)
- [Type Definitions](#type-definitions)

## Base Classes

### BaseBankAuth ([`./base-bank-auth.ts`](./base-bank-auth.ts))

Abstract class for Playwright-based bank authentication. Provides:

- **Browser lifecycle management** - init, cleanup, stealth measures
- **Request interception** - blocks ads, trackers, non-essential resources
- **Login template method** - subclasses implement `performBankSpecificLogin()`
- **Logging** - file-based debug logs with timestamps

Key features:
- Anti-bot detection (navigator overrides, plugin spoofing)
- Configurable performance presets (block CSS/images/fonts)
- Human-like delays and typing patterns

Usage by subclasses:

```typescript
class BanescoAuth extends BaseBankAuth<BanescoCredentials, BanescoAuthConfig, BanescoLoginResult> {
  protected performBankSpecificLogin(): Promise<boolean> {
    // Bank-specific iframe/form handling
  }
}
```

## HTTP Utilities

### CookieFetch ([`./utils/http-client.ts`](./utils/http-client.ts))

Fetch wrapper with automatic cookie jar management using `tough-cookie`. Features:

| Method | Description |
|--------|-------------|
| `getHtml(url)` | GET request returning HTML string |
| `postForm(url, data)` | POST form-encoded data, handles redirects manually |
| `getCookies(url)` | Get all cookies for a URL |
| `setCookie(cookie, url)` | Set a cookie manually |
| `clearCookies()` | Reset the cookie jar |

Helper functions:

| Function | Description |
|----------|-------------|
| `extractRequestVerificationToken(html)` | Extract ASP.NET MVC CSRF token |
| `extractAspNetFields(html)` | Extract all hidden form fields |
| `extractTableData(html, selector?)` | Parse HTML table into headers + rows |

## Performance Configuration

### Performance Presets ([`./performance-config.ts`](./performance-config.ts))

Configures resource blocking for faster scraping:

| Preset | CSS | Images | Fonts | Media | Non-essential JS |
|--------|-----|--------|-------|-------|------------------|
| `MAXIMUM` | Block | Block | Block | Block | Block |
| `AGGRESSIVE` | Block | Block | Block | Block | Allow |
| `BALANCED` | Allow | Block | Block | Block | Allow |
| `CONSERVATIVE` | Allow | Allow | Allow | Block | Allow |
| `NONE` | Allow | Allow | Allow | Allow | Allow |

Bank-specific defaults:

- **Banesco**: `CONSERVATIVE` (to avoid bot detection)
- **BNC**: `AGGRESSIVE` for auth, `BALANCED` for scraping

Usage:

```typescript
const config = getBankPerformanceConfig('banesco', 'auth');
// Returns { blockCSS: false, blockImages: false, ... }
```

## Type Definitions

### Base Types ([`./types/base.ts`](./types/base.ts))

| Type | Description |
|------|-------------|
| `BankCredentials` | Common credential fields |
| `BankAccount` | Account data structure |
| `BankTransaction` | Transaction data structure |
| `LoginResult` | Authentication result |
| `ScrapingResult<T>` | Scraping operation result |
| `BankConfig` | Bank configuration metadata |

### Auth Types ([`./types/index.ts`](./types/index.ts))

| Type | Description |
|------|-------------|
| `BaseBankAuthConfig` | Browser config (headless, timeout, debug) |
| `BaseBankLoginResult` | Login result (success, message, sessionValid) |
| `BaseBankScrapingConfig` | Scraping config (retries, waitBetweenActions) |

---

**Navigation:**
- [Back to src](../README.md)
- [Banks overview](../banks/README.md)
- [Root README](../../README.md)
