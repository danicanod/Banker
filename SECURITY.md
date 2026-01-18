# Security Guidelines

This document outlines security best practices for using and deploying this library.

## Credential Management

### Never Commit Secrets

- **Never** commit `.env` files or any file containing credentials
- Use `.gitignore` to exclude sensitive files (already configured)
- Store credentials in environment variables or secure secret managers

### Required Secrets

| Secret | Used By | Storage Recommendation |
|--------|---------|------------------------|
| `BANESCO_USERNAME` | Library, Scripts | Environment variable |
| `BANESCO_PASSWORD` | Library, Scripts | Environment variable |
| `BANESCO_SECURITY_QUESTIONS` | Library, Scripts | Environment variable |
| `BNC_ID` | Library, Scripts | Environment variable |
| `BNC_CARD` | Library, Scripts | Environment variable |
| `BNC_PASSWORD` | Library, Scripts | Environment variable |
| `NOTION_API_TOKEN` | Convex Actions | Convex Dashboard secrets |
| `BROWSERBASE_API_KEY` | Convex Actions | Convex Dashboard secrets |

### Convex Secrets

For Convex deployments, set secrets via the Convex Dashboard or CLI:

```bash
npx convex env set NOTION_API_TOKEN "secret_xxx..."
npx convex env set BROWSERBASE_API_KEY "bb_xxx..."
```

## Session Security

### Local Sessions

- Session data is stored in `.sessions/` directory (gitignored)
- Sessions expire after 24 hours by default
- Clear sessions manually if compromised: `rm -rf .sessions/`

### Cookie Handling

- Cookies are stored in memory during scraping operations
- Cookies are not persisted to disk by default
- When transferring cookies between Playwright and HTTP clients, ensure the transfer happens in-memory only

## Logging Security

### What NOT to Log

- Passwords or security question answers
- Session tokens or cookies
- Full API keys or tokens
- Personal identification numbers (cedula)

### Safe Logging Practices

```typescript
// BAD: Logs full credentials
console.log('Logging in with:', credentials);

// GOOD: Logs masked identifier
console.log('Logging in as:', credentials.username.slice(0, 3) + '***');
```

## Network Security

### Bank Connections

- All bank connections use HTTPS
- The library does not disable SSL verification
- Do not use this library on untrusted networks

### Notion API

- Always use the official Notion API token
- Limit integration permissions to only required databases
- Regularly rotate API tokens

## Deployment Security

### Local Development

- Use `.env` files for local development only
- Never share `.env` files between team members via insecure channels

### Production (Convex)

- Use Convex's built-in secret management
- Enable audit logging if available
- Monitor for unusual sync patterns

### CI/CD

- Use GitHub Secrets or equivalent for CI credentials
- Never print secrets in CI logs
- Use secret masking features

## Vulnerability Reporting

If you discover a security vulnerability, please:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly at danicanod@gmail.com
3. Include steps to reproduce if possible
4. Allow reasonable time for a fix before disclosure

## Security Checklist

Before deploying to production:

- [ ] All secrets are stored in environment variables (not hardcoded)
- [ ] `.env` file is in `.gitignore`
- [ ] Logging does not expose sensitive data
- [ ] Notion integration has minimal required permissions
- [ ] Session directory is excluded from version control
- [ ] CI/CD secrets are properly configured
