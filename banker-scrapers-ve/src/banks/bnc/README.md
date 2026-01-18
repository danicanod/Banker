# BNC Bank Scraper

HTTP-only scraper for BNC online banking. No browser required.

## Usage

```typescript
import { BncScraper } from '@danicanod/banker-venezuela/bnc';

const scraper = new BncScraper({
  id: 'V12345678',
  card: '1234567890123456',
  password: 'your_password'
});

const session = await scraper.scrapeAll();
console.log(session.transactionResults[0].data);

await scraper.close();
```

## Credentials

```typescript
interface BncCredentials {
  id: string;        // Cédula with V prefix
  card: string;      // 16-digit card number
  password: string;
}
```

## Known Issue: Session Conflicts

BNC tracks sessions server-side. If you see:

```
"Existe una sesión previa activa, la nueva sesión ha sido denegada"
```

Wait ~5 minutes for the previous session to expire, or ensure `logoutFirst: true` (default).

## See Also

- [Main README](../../../README.md)
- [Banesco docs](../banesco/README.md)
