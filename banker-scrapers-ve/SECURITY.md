# Security Policy

## Credential Handling

- **Never commit credentials** to version control
- Use environment variables or a secrets manager
- The library never logs passwords or security answers

## Session Persistence

Session persistence is **disabled by default**. If enabled:

- Session files contain sensitive cookies and tokens
- `.sessions/` directory is gitignored
- For production, implement your own `SessionStorageProvider` with encryption

## Logging

Default log level is `warn`. Sensitive data is never logged, but set `logLevel: 'silent'` for maximum security.

## Reporting Vulnerabilities

Email security concerns to danicanod@gmail.com.
