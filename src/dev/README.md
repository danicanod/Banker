# Development Tools

Developer utilities for debugging and analyzing bank authentication flows.

**These are NOT part of the library** - they are standalone scripts for development use.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Network Capture | `npm run capture:banesco` | Capture HTTP flow for Banesco auth |
| Network Capture | `npm run capture:bnc` | Capture HTTP flow for BNC auth |
| Performance | `npm run example:performance` | Test client performance |

## capture-network-flow.ts

Runs authentication flows while capturing all HTTP requests/responses. Useful for:
- Understanding bank authentication sequences
- Debugging failed logins
- Developing new pure-HTTP implementations

Output: `network-capture-{bank}-{timestamp}.json`

## performance-optimization.ts

Demonstrates optimal client usage patterns for each bank.

---

**Navigation:**
- [Back to src](../README.md)
- [Banks overview](../banks/README.md)
- [Shared utilities](../shared/README.md)
