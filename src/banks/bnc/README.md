# BNC Client

```typescript
import { createBncClient } from '@danicanod/banker-venezuela/bnc';

const client = createBncClient({
  id: 'V12345678',
  cardNumber: '1234567890123456',
  password: 'your_password'
});

await client.login();
const result = await client.getTransactions();
await client.close();
```
