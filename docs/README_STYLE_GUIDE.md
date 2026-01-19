# README Style Guide

This document defines the README conventions for the `banker-venezuela` repository. Follow these rules when creating or updating READMEs to ensure consistency and readability.

## Table of Contents

- [Core Principles](#core-principles)
- [Structure Rules](#structure-rules)
- [Formatting Conventions](#formatting-conventions)
- [TypeScript Code Blocks](#typescript-code-blocks)
- [Templates](#templates)

---

## Core Principles

1. **Consumer-first**: Optimize for library users. Installation, quickstart, and API surface should be immediately visible.
2. **30-second rule**: A developer should understand what the module does and how to use it within 30 seconds.
3. **Scannable**: Use tables, bullet points, and short paragraphs. Avoid walls of text.
4. **Consistent navigation**: Every README ends with a Navigation footer linking to related docs.
5. **English only**: All documentation and log messages should be in English.

---

## Structure Rules

### Root README

The root README is the public face of the library. It should include:

| Section | Required | Notes |
|---------|----------|-------|
| Hero (title + badges) | Yes | Centered, badges in a single row |
| One-line description | Yes | What the library does |
| Quick navigation links | Yes | Inline links to main sections |
| Supported Banks table | Yes | Bank name, auth method, capabilities |
| Why / Use Cases | Yes | 2-4 bullet points |
| Installation | Yes | npm/yarn/pnpm commands |
| Quick Start | Yes | One snippet per bank |
| API Entry Points | Yes | Import paths consumers should use |
| Setup / Configuration | Yes | Environment variables |
| Commands | Yes | Table of npm scripts |
| Security | Yes | Credential handling, session management |
| License | Yes | MIT with link to LICENSE file |
| Footer | Yes | Centered closing statement |

### Submodule READMEs (`src/`, `scripts/`, `convex/`)

These READMEs document internal structure for contributors and advanced users.

| Section | Required | Notes |
|---------|----------|-------|
| Title with path | Yes | e.g., `# Library Source (\`src/\`)` |
| One-line description | Yes | Scope of this directory |
| Audience note | Optional | Who should read this doc |
| Table of Contents | If >2 screens | Helps navigation |
| Main content | Yes | Tables, flows, code snippets |
| Navigation footer | Yes | Links to root and sibling docs |

### Bank READMEs (`src/banks/{bank}/`)

Consumer-facing documentation for each bank client.

| Section | Required | Notes |
|---------|----------|-------|
| Title | Yes | e.g., `# BNC Client` |
| Overview | Yes | What the client does, limitations |
| Authentication | Yes | Required credentials, types |
| Quickstart | Yes | Complete working example |
| Response Handling | Yes | How to access returned data |
| Error Handling | Yes | Common failures and recovery |
| Security Notes | Yes | Credential redaction guidance |
| Navigation footer | Yes | Links to parent docs |

---

## Formatting Conventions

### Badges

- Only use badges in the root README
- Keep badges in a single row
- Use `for-the-badge` style for technology badges
- Use standard style for status badges (license, version)

```markdown
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
```

### Tables

Use tables for:
- Listing supported banks and features
- Environment variables
- Commands and their descriptions
- Function/export summaries

```markdown
| Bank | Auth Method | Transactions |
|------|-------------|--------------|
| Banesco | Username + Password + Security Questions | Full history |
| BNC | Card + ID + Password | Last 25 |
```

### Navigation Footer

Every submodule README must end with:

```markdown
---

**Navigation:**
- [Back to root](../README.md)
- [Related doc 1](./path/to/doc.md)
- [Related doc 2](./path/to/doc.md)
```

### Headings

- Use `#` for the document title only
- Use `##` for main sections
- Use `###` for subsections
- Avoid going deeper than `####`

### Links

- Use relative paths for internal links
- Link to specific files when referencing code: `[./schema.ts](./schema.ts)`
- Use anchor links for same-document navigation: `[Quick Start](#quick-start)`

---

## TypeScript Code Blocks

### Always specify the language

```typescript
import { createBncClient } from '@danicanod/banker-venezuela';
```

### Show complete, working examples

Bad:
```typescript
const client = new Client();
```

Good:
```typescript
import { createBncClient } from '@danicanod/banker-venezuela';

const client = createBncClient({
  id: 'V12345678',
  cardNumber: '1234567890123456',
  password: 'your_password'
});

await client.login();
const result = await client.getTransactions();
await client.close();
```

### Use consumer import paths

Show imports exactly as consumers should use them:

```typescript
// Root export
import { createBanescoClient, createBncClient } from '@danicanod/banker-venezuela';

// Bank-specific export
import { createBncClient } from '@danicanod/banker-venezuela/bnc';
```

### Include type annotations when relevant

```typescript
import type { BncTransaction } from '@danicanod/banker-venezuela/bnc';

const result = await client.getTransactions();
const transactions: BncTransaction[] = result.data ?? [];
```

---

## Templates

### Root README Template

```markdown
# Project Name

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

A one-line description of what this library does.

[Installation](#installation) • [Quick Start](#quick-start) • [API](#api) • [Setup](#setup)

</div>

---

## Supported Features

| Feature | Description |
|---------|-------------|
| Feature 1 | What it does |
| Feature 2 | What it does |

## Why Use This

- Bullet point 1
- Bullet point 2
- Bullet point 3

## Installation

\`\`\`bash
npm install package-name
\`\`\`

### Prerequisites

- Node.js >= 18
- npm >= 8

## Quick Start

\`\`\`typescript
import { MainExport } from 'package-name';

const instance = MainExport.create({ config: 'value' });
const result = await instance.doSomething();
console.log(result);
\`\`\`

## API Entry Points

| Import | Description |
|--------|-------------|
| `package-name` | Main exports |
| `package-name/module` | Module-specific exports |

## Setup

Environment variables:

\`\`\`bash
VAR_NAME=value
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build the project |
| `npm run test` | Run tests |

## Security

- Credential handling notes
- Session management notes

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

Made for the community

</div>
```

### Submodule README Template

```markdown
# Module Name (`path/`)

One-line description of what this module contains.

**Audience:** Contributors and advanced users exploring internals.

## Table of Contents

- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1

Content with tables, code blocks, etc.

## Section 2

More content.

---

**Navigation:**
- [Back to root](../README.md)
- [Related module](./sibling/README.md)
```

### Bank README Template

```markdown
# Bank Client

Brief description of this bank client and its capabilities.

## Overview

| Feature | Value |
|---------|-------|
| Auth Method | What credentials are needed |
| Transactions | How many / what period |
| Limitations | Any known restrictions |

## Authentication

Required credentials:

| Field | Type | Description |
|-------|------|-------------|
| `field1` | `string` | Description |
| `field2` | `string` | Description |

## Quickstart

\`\`\`typescript
import { createBankClient } from '@danicanod/banker-venezuela/bank';

const client = createBankClient({
  field1: 'value1',
  field2: 'value2'
});

await client.login();
const result = await client.getData();
console.log(result.data);
await client.close();
\`\`\`

## Response Handling

The client returns typed responses:

\`\`\`typescript
const result = await client.getData();

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
\`\`\`

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `AUTH_FAILED` | Invalid credentials | Verify credentials |
| `TIMEOUT` | Network issue | Retry with backoff |

## Security Notes

- Never log raw credentials
- Use environment variables for sensitive data
- Mask identifiers in logs (e.g., `V12***` instead of full ID)

---

**Navigation:**
- [Back to banks](../README.md)
- [Back to src](../../README.md)
- [Back to root](../../../README.md)
```

---

## Checklist

Before committing README changes:

- [ ] All code blocks specify the language (`typescript`, `bash`, etc.)
- [ ] All internal links are relative and working
- [ ] Navigation footer is present
- [ ] No badges in submodule READMEs
- [ ] Consumer import paths match actual exports
- [ ] All content is in English
