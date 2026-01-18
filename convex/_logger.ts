/**
 * Standardized Logger for Convex Actions
 * 
 * Provides consistent logging with:
 * - Log levels (debug, info, warn, error)
 * - Run ID correlation
 * - Secret redaction
 * - Structured prefixes
 * 
 * Usage:
 * ```typescript
 * const log = createLogger("Movimientos", runId);
 * log.info("Starting sync");
 * log.debug("Processing transaction", { ref: "123" });
 * log.error("Failed to sync", error);
 * ```
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Patterns to redact from log messages.
 * Matches common secret formats.
 */
const REDACTION_PATTERNS = [
  // API tokens (secret_xxx, ntn_xxx, etc.)
  /\b(secret_|ntn_|Bearer\s+)[A-Za-z0-9_-]{20,}\b/gi,
  // Session tokens / cookies
  /\b(session|token|cookie|auth)[=:]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/gi,
  // Passwords in strings
  /\b(password|passwd|pwd)[=:]\s*['"][^'"]+['"]/gi,
  // UUID-like secrets (only if prefixed with secret indicator)
  /\b(api_key|apikey|api-key)[=:]\s*['"]?[A-Za-z0-9-]{30,}['"]?/gi,
];

/**
 * Redact sensitive information from a string.
 */
function redact(message: string): string {
  let result = message;
  for (const pattern of REDACTION_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ============================================================================
// Logger Interface
// ============================================================================

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown) => void;
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a logger instance for a specific context.
 * 
 * @param context - Context name (e.g., "Movimientos", "Notion Sync")
 * @param runId - Optional run ID for correlation (from sync lock)
 * @returns Logger instance
 * 
 * @example
 * ```typescript
 * const log = createLogger("Movimientos Sync", "abc123");
 * log.info("Starting sync");
 * // Output: [Movimientos Sync] [abc123] Starting sync
 * ```
 */
export function createLogger(context: string, runId?: string): Logger {
  const prefix = runId 
    ? `[${context}] [${runId.slice(0, 8)}]` 
    : `[${context}]`;
  
  // Check if debug mode is enabled
  const debugEnabled = process.env.SYNC_DEBUG === "true" || 
                       process.env.DEBUG === "true";
  
  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      const msg = redact(`${prefix} [DEBUG] ${message}`);
      if (data) {
        console.log(msg, JSON.stringify(data));
      } else {
        console.log(msg);
      }
    },
    
    info: (message: string, data?: Record<string, unknown>) => {
      const msg = redact(`${prefix} ${message}`);
      if (data) {
        console.log(msg, JSON.stringify(data));
      } else {
        console.log(msg);
      }
    },
    
    warn: (message: string, data?: Record<string, unknown>) => {
      const msg = redact(`${prefix} [WARN] ${message}`);
      if (data) {
        console.warn(msg, JSON.stringify(data));
      } else {
        console.warn(msg);
      }
    },
    
    error: (message: string, error?: Error | unknown) => {
      const msg = redact(`${prefix} [ERROR] ${message}`);
      if (error instanceof Error) {
        console.error(msg, redact(error.message));
      } else if (error) {
        console.error(msg, redact(String(error)));
      } else {
        console.error(msg);
      }
    },
  };
}

// ============================================================================
// Quick Logging (without context)
// ============================================================================

/**
 * Quick log functions for simple cases.
 */
export const log = {
  debug: (message: string) => {
    if (process.env.SYNC_DEBUG === "true" || process.env.DEBUG === "true") {
      console.log(redact(`[DEBUG] ${message}`));
    }
  },
  info: (message: string) => console.log(redact(message)),
  warn: (message: string) => console.warn(redact(`[WARN] ${message}`)),
  error: (message: string, error?: Error | unknown) => {
    if (error instanceof Error) {
      console.error(redact(`[ERROR] ${message}`), redact(error.message));
    } else {
      console.error(redact(`[ERROR] ${message}`));
    }
  },
};
