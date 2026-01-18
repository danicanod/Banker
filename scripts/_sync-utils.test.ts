/**
 * Unit Tests for Sync Utilities
 * 
 * Run with: npx tsx scripts/_sync-utils.test.ts
 * 
 * Tests the deterministic txnKey generation contract to ensure
 * consistency across all ingestion paths.
 */

import { makeTxnKey } from "./_sync-utils.js";
import { createHash } from "crypto";

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected "${expected}" but got "${actual}"`
    );
  }
}

function assertStartsWith(actual: string, prefix: string): void {
  if (!actual.startsWith(prefix)) {
    throw new Error(`Expected string to start with "${prefix}" but got "${actual}"`);
  }
}

function assertLength(actual: string, length: number): void {
  if (actual.length !== length) {
    throw new Error(`Expected length ${length} but got ${actual.length}`);
  }
}

// ============================================================================
// txnKey Generation Tests
// ============================================================================

console.log("\n=== txnKey Generation Tests ===\n");

test("makeTxnKey returns deterministic key for same inputs", () => {
  const tx = {
    date: "2025-01-15",
    amount: 100.50,
    description: "Test transaction",
    type: "debit" as const,
  };
  
  const key1 = makeTxnKey("banesco", tx);
  const key2 = makeTxnKey("banesco", tx);
  
  assertEqual(key1, key2, "Same inputs should produce same key");
});

test("makeTxnKey prefixes with bank code", () => {
  const tx = {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
    type: "debit" as const,
  };
  
  const banescoKey = makeTxnKey("banesco", tx);
  const bncKey = makeTxnKey("bnc", tx);
  
  assertStartsWith(banescoKey, "banesco-");
  assertStartsWith(bncKey, "bnc-");
});

test("makeTxnKey has correct format (bank-16charhash)", () => {
  const key = makeTxnKey("banesco", {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
    type: "debit",
  });
  
  const parts = key.split("-");
  assertEqual(parts[0], "banesco", "First part should be bank code");
  assertLength(parts[1], 16, "Hash part should be 16 characters");
});

test("makeTxnKey uses absolute amount value", () => {
  const tx1 = {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
    type: "debit" as const,
  };
  
  const tx2 = {
    ...tx1,
    amount: -100, // Negative amount
  };
  
  const key1 = makeTxnKey("banesco", tx1);
  const key2 = makeTxnKey("banesco", tx2);
  
  assertEqual(key1, key2, "Positive and negative amounts should produce same key");
});

test("makeTxnKey prefers reference over description", () => {
  const txWithRef = {
    date: "2025-01-15",
    amount: 100,
    description: "Some description",
    type: "debit" as const,
    reference: "REF123456",
  };
  
  const txWithDifferentDesc = {
    ...txWithRef,
    description: "Different description",
  };
  
  const key1 = makeTxnKey("banesco", txWithRef);
  const key2 = makeTxnKey("banesco", txWithDifferentDesc);
  
  assertEqual(key1, key2, "When reference exists, description changes should not affect key");
});

test("makeTxnKey uses description when no reference", () => {
  const tx1 = {
    date: "2025-01-15",
    amount: 100,
    description: "Description A",
    type: "debit" as const,
  };
  
  const tx2 = {
    ...tx1,
    description: "Description B",
  };
  
  const key1 = makeTxnKey("banesco", tx1);
  const key2 = makeTxnKey("banesco", tx2);
  
  if (key1 === key2) {
    throw new Error("Different descriptions should produce different keys when no reference");
  }
});

test("makeTxnKey different bank codes produce different keys", () => {
  const tx = {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
    type: "debit" as const,
  };
  
  const banescoKey = makeTxnKey("banesco", tx);
  const bncKey = makeTxnKey("bnc", tx);
  
  if (banescoKey === bncKey) {
    throw new Error("Different banks should produce different keys");
  }
});

test("makeTxnKey different types produce different keys", () => {
  const base = {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
  };
  
  const debitKey = makeTxnKey("banesco", { ...base, type: "debit" });
  const creditKey = makeTxnKey("banesco", { ...base, type: "credit" });
  
  if (debitKey === creditKey) {
    throw new Error("Different transaction types should produce different keys");
  }
});

test("makeTxnKey trims whitespace from reference", () => {
  const tx1 = {
    date: "2025-01-15",
    amount: 100,
    description: "Test",
    type: "debit" as const,
    reference: "REF123",
  };
  
  const tx2 = {
    ...tx1,
    reference: "  REF123  ", // With whitespace
  };
  
  const key1 = makeTxnKey("banesco", tx1);
  const key2 = makeTxnKey("banesco", tx2);
  
  assertEqual(key1, key2, "Whitespace in reference should be trimmed");
});

test("makeTxnKey trims whitespace from description", () => {
  const tx1 = {
    date: "2025-01-15",
    amount: 100,
    description: "Test description",
    type: "debit" as const,
  };
  
  const tx2 = {
    ...tx1,
    description: "  Test description  ", // With whitespace
  };
  
  const key1 = makeTxnKey("banesco", tx1);
  const key2 = makeTxnKey("banesco", tx2);
  
  assertEqual(key1, key2, "Whitespace in description should be trimmed");
});

// ============================================================================
// Key Contract Verification
// ============================================================================

console.log("\n=== Key Contract Verification ===\n");

test("makeTxnKey matches expected contract format", () => {
  // Verify the key contract: sha256(bank|date|amount|type|identifier)
  const tx = {
    date: "2025-01-15",
    amount: 100.50,
    description: "Test transaction",
    type: "debit" as const,
    reference: "REF123",
  };
  
  // Expected: uses reference as identifier
  const expectedInput = "banesco|2025-01-15|100.5|debit|REF123";
  const expectedHash = createHash("sha256").update(expectedInput).digest("hex").slice(0, 16);
  const expectedKey = `banesco-${expectedHash}`;
  
  const actualKey = makeTxnKey("banesco", tx);
  
  assertEqual(actualKey, expectedKey, "Key should match contract formula");
});

test("makeTxnKey without reference uses description in contract", () => {
  const tx = {
    date: "2025-01-15",
    amount: 100.50,
    description: "Test transaction",
    type: "debit" as const,
  };
  
  // Expected: uses description as identifier (no reference)
  const expectedInput = "banesco|2025-01-15|100.5|debit|Test transaction";
  const expectedHash = createHash("sha256").update(expectedInput).digest("hex").slice(0, 16);
  const expectedKey = `banesco-${expectedHash}`;
  
  const actualKey = makeTxnKey("banesco", tx);
  
  assertEqual(actualKey, expectedKey, "Key should use description when no reference");
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n=== Test Summary ===\n");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log("\n✅ All tests passed!\n");
