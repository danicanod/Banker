# 🏦 Banesco Bank Scraper v2.0

Enterprise-grade Playwright-based scraper for Banesco online banking with abstract base class architecture and intelligent security question handling.

## 🏗️ Architecture

Built on the new abstract base class system for maximum code reuse and consistency:

```typescript
// Extends base authentication class
export class BanescoAuth extends BaseBankAuth<BanescoCredentials, BanescoAuthConfig, BanescoLoginResult>

// Extends base scraper class  
export class BanescoTransactionsScraper extends BaseBankScraper<BanescoTransaction, BanescoScrapingConfig, BanescoScrapingResult>

// Unified main scraper API
export class BanescoScraper
```

## 📁 Structure

```
src/banks/banesco/
├── auth/
│   └── banesco-auth.ts      # Authentication implementation (347 lines)
├── scrapers/
│   ├── banesco-scraper.ts   # Main scraper with unified API
│   └── transactions.ts      # Transaction scraper (430 lines)
├── types/
│   └── index.ts            # Bank-specific types extending base types
├── examples/
│   └── basic-usage.ts      # Usage examples with new APIs
├── index.ts               # Consistent exports
└── README.md             # This documentation
```

## 🚀 Quick Start

### Simple Usage with Factory Function

```typescript
import { quickScrape } from './src/banks/banesco';

// One-liner for quick transactions
const transactions = await quickScrape({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'madre:maria,colegio:central,mascota:firulais'
}, { debug: true });

console.log(`Found ${transactions.length} transactions`);
```

### Full Session Control

```typescript
import { BanescoScraper, createBanescoScraper } from './src/banks/banesco';

// Factory method
const scraper = createBanescoScraper({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'madre:maria,colegio:central'
}, { debug: true });

// Full scraping session
const session = await scraper.scrapeAll();
console.log(`Authentication: ${session.authResult.success}`);
console.log(`Transactions: ${session.transactionResults[0].data?.length}`);

// Individual operations
await scraper.authenticate();
const transactions = await scraper.scrapeTransactions(); 
```

### Direct Class Usage

```typescript
import { BanescoAuth, BanescoTransactionsScraper } from './src/banks/banesco';

// Authentication only
const auth = new BanescoAuth({
  username: 'V12345678',
  password: 'your_password',
  securityQuestions: 'madre:maria,colegio:central,mascota:firulais'
}, { debug: true });

const result = await auth.login();
if (result.success) {
  console.log('✅ Authentication successful!');
  
  // Use authenticated page for scraping
  const scraper = new BanescoTransactionsScraper(auth.getPage()!, { debug: true });
  const transactions = await scraper.scrapeTransactions();
}

await auth.close();
```

## 🔐 Security Questions Configuration

Banesco uses intelligent security question matching with keyword-based configuration:

```typescript
interface BanescoCredentials extends BaseBankCredentials {
  username: string;         // Cédula de identidad (V12345678 or 12345678)
  password: string;         // Online banking password
  securityQuestions: string; // Keyword:answer pairs
}
```

### Configuration Format

Security questions are configured as comma-separated keyword:answer pairs:

```typescript
const securityQuestions = [
  'madre:maria',           // Keyword: "madre", Answer: "maria"
  'colegio:san jose',      // Keyword: "colegio", Answer: "san jose"
  'mascota:firulais',      // Keyword: "mascota", Answer: "firulais"
  'color:azul',            // Keyword: "color", Answer: "azul"
  'ciudad:caracas',        // Keyword: "ciudad", Answer: "caracas"
  'libro:bible',           // Keyword: "libro", Answer: "bible"
  'anime:naruto'           // Keyword: "anime", Answer: "naruto"
].join(',');
```

### Common Keywords Mapping

Our base class provides intelligent matching for:

- **madre** - matches "¿Cuál es el nombre de tu madre?"
- **padre** - matches "¿Cuál es el nombre de tu padre?"
- **colegio** - matches "¿En qué colegio estudiaste?" / "¿Cuál es tu colegio?"
- **mascota** - matches "¿Cuál es el nombre de tu mascota?"
- **color** - matches "¿Cuál es tu color favorito?"
- **ciudad** - matches "¿En qué ciudad naciste?" / "¿Cuál es tu ciudad?"
- **libro** - matches "¿Cuál es tu libro favorito?"
- **anime** - matches "¿Cuál es tu anime favorito?"

## ⚙️ Configuration Options

### Authentication Configuration
```typescript
interface BanescoAuthConfig extends BaseBankAuthConfig {
  headless?: boolean;      // Default: false
  timeout?: number;        // Default: 30000ms
  debug?: boolean;         // Default: false
  saveSession?: boolean;   // Default: true
  retries?: number;        // Default: 3
}
```

### Scraping Configuration
```typescript
interface BanescoScrapingConfig extends BaseBankScrapingConfig {
  debug?: boolean;              // Default: false
  timeout?: number;             // Default: 30000ms
  waitBetweenActions?: number;  // Default: 1000ms
  retries?: number;             // Default: 3
  saveHtml?: boolean;           // Default: false
  alternativeExtraction?: boolean; // Use alternative extraction methods
}
```

### Debug Mode

Enable comprehensive debugging with unified logging:

```typescript
const scraper = new BanescoScraper(credentials, {
  headless: false,   // Show browser window
  debug: true,       // Enable debug logging + pauses
  timeout: 120000,   // Extended timeout for manual inspection
  saveHtml: true     // Save HTML captures for analysis
});
```

## 📝 Environment Variables

```bash
# .env file
BANESCO_USERNAME=V12345678
BANESCO_PASSWORD=your_password
BANESCO_SECURITY_QUESTIONS="madre:maria,colegio:central,mascota:firulais"

# Optional debugging
DEBUG=true
HEADLESS=false
```

## 🔧 Unified API Reference

All Banesco classes follow the same API pattern as other banks in the system:

### Main Scraper API

```typescript
class BanescoScraper {
  // Authentication
  async authenticate(): Promise<BanescoLoginResult>
  async isAuthenticated(): Promise<boolean>
  
  // Scraping operations
  async scrapeAll(): Promise<BanescoScrapingSession>
  async scrapeTransactions(): Promise<BanescoScrapingResult>
  
  // Session management
  getPage(): Page | undefined
  async exportSession(session: BanescoScrapingSession): Promise<void>
  async close(): Promise<void>
}
```

### Factory Functions

```typescript
// Quick scrape function
async function quickScrape(
  credentials: BanescoCredentials, 
  config?: BanescoScrapingConfig
): Promise<BanescoTransaction[]>

// Scraper factory
function createBanescoScraper(
  credentials: BanescoCredentials,
  config?: BanescoAuthConfig
): BanescoScraper
```

### Base Class Methods (Inherited)

From `BaseBankAuth`:
```typescript
// Template method pattern
async login(): Promise<BanescoLoginResult>
protected async performBankSpecificLogin(): Promise<boolean>
protected async verifyLoginSuccess(): Promise<boolean>

// Common utilities
protected async waitForElement(selector: string): Promise<ElementHandle>
protected async waitForNavigation(): Promise<void>
protected log(message: string, level?: LogLevel): void
```

From `BaseBankScraper`:
```typescript
// Template method pattern  
abstract async scrapeTransactions(): Promise<BanescoScrapingResult>
abstract parseTransactionData(rawData: any[]): BanescoTransaction[]

// Common utilities
protected async waitForTableLoad(): Promise<void>
protected async extractTableData(): Promise<any[]>
protected parseAmount(amountStr: string): number
protected parseDate(dateStr: string): Date | null
```

## 📊 Performance & Code Reduction

### Architecture Benefits
- **46% code reduction** in transaction scraper (794 → 430 lines)
- **42% code reduction** in authentication (602 → 347 lines)
- **100% elimination** of duplicate code with BNC
- **Unified error handling** and logging
- **Template method pattern** for clean extension

### Smart Features
- **Intelligent security question matching** with fuzzy keyword detection
- **Iframe navigation handling** for complex Banesco layout
- **Flexible table analysis** with multiple extraction strategies
- **System availability detection** ("En estos momentos no podemos...")
- **Alternative extraction methods** for resilient scraping
- **Modal management** for popups and overlays

## 📊 Error Handling

Enhanced error handling with base class standardization:

```typescript
const result = await scraper.authenticate();

if (!result.success) {
  console.log('Authentication failed:', result.message);
  
  // Standardized error codes from base class
  switch (result.error) {
    case 'INVALID_CREDENTIALS':
      console.log('💡 Verify your username and password');
      break;
    case 'SECURITY_QUESTIONS_FAILED':
      console.log('💡 Check your security questions configuration');
      console.log('💡 Format: "madre:maria,colegio:central"');
      break;
    case 'SYSTEM_UNAVAILABLE':
      console.log('💡 Banesco system is temporarily unavailable');
      break;
    case 'IFRAME_NAVIGATION_FAILED':
      console.log('💡 Complex iframe navigation failed');
      break;
    case 'MAX_RETRIES_EXCEEDED':
      console.log('💡 Multiple attempts failed, try again later');
      break;
  }
}
```

## 🧪 Testing & Development

### Running Examples

```bash
# Basic usage example
npx ts-node src/banks/banesco/examples/basic-usage.ts

# Debug mode
DEBUG=true npx ts-node src/banks/banesco/examples/basic-usage.ts

# Test authentication only
npx ts-node -e "
import { BanescoAuth } from './src/banks/banesco';
const auth = new BanescoAuth(process.env, { debug: true });
auth.login().then(r => console.log(r));
"
```

### Development Guidelines

When extending or modifying Banesco functionality:

1. **Follow base class patterns** - Extend `BaseBankAuth`/`BaseBankScraper`
2. **Maintain unified APIs** - Keep methods consistent with BNC
3. **Use template methods** - Override abstract methods, call super for common logic
4. **Handle security questions** - Use the keyword mapping system
5. **Test iframe navigation** - Banesco has complex nested iframe structure

## 🔗 Integration with Base System

This scraper seamlessly integrates with the unified banking framework:

```typescript
// Import from main package
import { BanescoScraper, BncScraper } from './src';

// Both scrapers have identical APIs
const banescoScraper = new BanescoScraper(banescoCredentials);
const bncScraper = new BncScraper(bncCredentials);

// Identical method calls
await banescoScraper.authenticate();
await bncScraper.authenticate();

// Identical scraping calls  
const banescoTransactions = await banescoScraper.scrapeTransactions();
const bncTransactions = await bncScraper.scrapeTransactions();
```

## 🏷️ Migration from v1.x

If upgrading from the old Banesco implementation:

```typescript
// Old way (v1.x)
import { BanescoAuth } from './old-banesco-auth';
const auth = new BanescoAuth(credentials);
const result = await auth.performLogin();

// New way (v2.0) - Unified API
import { BanescoScraper } from './src/banks/banesco';
const scraper = new BanescoScraper(credentials);
const result = await scraper.authenticate();

// Or use quick scrape
import { quickScrape } from './src/banks/banesco';
const transactions = await quickScrape(credentials);
```

## 🔍 Banesco-Specific Features

### System Availability Detection
```typescript
// Automatic detection of system messages
if (result.systemMessage) {
  console.log('🚫 System message:', result.systemMessage);
  // Example: "En estos momentos no podemos procesar su solicitud"
}
```

### Security Question Intelligence
```typescript
// Automatically matches questions to answers
const questions = 'madre:maria,color:azul,mascota:firulais';
// Will match any of these question patterns:
// - "¿Cuál es el nombre de tu madre?" → "maria"
// - "¿Cuál es tu color favorito?" → "azul"  
// - "¿Cómo se llama tu mascota?" → "firulais"
```

### Iframe Navigation
```typescript
// Handles complex Banesco iframe structure automatically
// No manual iframe switching needed
const scraper = new BanescoScraper(credentials, { debug: true });
// Will automatically navigate through nested iframes
```

## 📚 Documentation

- 🏦 **[BNC README](../bnc/README.md)** - Sister implementation (HTTP-only)
- 📖 **[Main README](../../../README.md)** - Full library documentation

---

**Part of the Banker Venezuela banking automation library.** 