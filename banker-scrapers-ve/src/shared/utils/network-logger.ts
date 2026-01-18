/**
 * Network Logger Utility
 * 
 * Captures all HTTP requests and responses during Playwright sessions
 * for analysis of bank authentication flows. Useful for understanding
 * what's needed to implement pure fetch-based alternatives.
 * 
 * IMPORTANT: Network logging is DISABLED by default.
 * Network captures may contain sensitive data. Only enable in development.
 */

import { Page, Request, Response } from 'playwright';
import { writeFileSync } from 'fs';

export interface CapturedRequest {
  timestamp: string;
  url: string;
  method: string;
  resourceType: string;
  headers: Record<string, string>;
  postData?: string;
  postDataFields?: Record<string, string>;
}

export interface CapturedResponse {
  timestamp: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType?: string;
}

export interface NetworkLogEntry {
  request: CapturedRequest;
  response?: CapturedResponse;
}

export interface NetworkLoggerConfig {
  /** Enable network logging (default: false) */
  enabled?: boolean;
  /** Log to console in real-time (default: false) */
  logToConsole?: boolean;
  /** Save captured data to JSON file (default: false) */
  saveToFile?: boolean;
  /** Output file path */
  outputPath?: string;
  /** Only capture document/XHR/fetch requests (skip images, fonts, etc) */
  filterEssentialOnly?: boolean;
  /** Redact sensitive values in logs (default: true) */
  redactSensitive?: boolean;
  /** List of field names to redact (passwords, tokens, etc) */
  sensitiveFields?: string[];
}

const DEFAULT_SENSITIVE_FIELDS = [
  'password', 'clave', 'txtClave', 'txtPassword', 'pwd', 'pass',
  'token', 'authorization', 'auth', 'secret', 'key', 'apikey',
  'cookie', 'session', 'csrf', '__VIEWSTATE', '__EVENTVALIDATION'
];

export class NetworkLogger {
  private entries: NetworkLogEntry[] = [];
  private config: Required<NetworkLoggerConfig>;
  private requestMap: Map<string, CapturedRequest> = new Map();
  private enabled: boolean;

  constructor(config: NetworkLoggerConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.config = {
      enabled: this.enabled,
      logToConsole: config.logToConsole ?? false, // OFF by default
      saveToFile: config.saveToFile ?? false,      // OFF by default
      outputPath: config.outputPath ?? `network-capture-${Date.now()}.json`,
      filterEssentialOnly: config.filterEssentialOnly ?? true,
      redactSensitive: config.redactSensitive ?? true,
      sensitiveFields: [...DEFAULT_SENSITIVE_FIELDS, ...(config.sensitiveFields || [])]
    };
  }

  /**
   * Check if network logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Attach listeners to a Playwright page to capture all network activity
   */
  attach(page: Page): void {
    if (!this.enabled) {
      return; // Don't attach listeners if disabled
    }
    
    page.on('request', (request) => this.onRequest(request));
    page.on('response', (response) => this.onResponse(response));
    
    if (this.config.logToConsole) {
      console.log('Network logger attached - capturing requests (DEBUG MODE)');
    }
  }

  private shouldCapture(resourceType: string): boolean {
    if (!this.enabled) return false;
    if (!this.config.filterEssentialOnly) return true;
    
    const essentialTypes = ['document', 'xhr', 'fetch', 'script'];
    return essentialTypes.includes(resourceType);
  }

  private redactValue(key: string, value: string): string {
    if (!this.config.redactSensitive) return value;
    
    const keyLower = key.toLowerCase();
    const shouldRedact = this.config.sensitiveFields.some(field => 
      keyLower.includes(field.toLowerCase())
    );
    
    if (shouldRedact && value.length > 0) {
      // Show first 3 chars and last 3 chars for debugging
      if (value.length > 10) {
        return `${value.substring(0, 3)}...<redacted>...${value.substring(value.length - 3)}`;
      }
      return '<redacted>';
    }
    
    return value;
  }

  private redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      redacted[key] = this.redactValue(key, value);
    }
    return redacted;
  }

  private parsePostData(postData: string | null): Record<string, string> | undefined {
    if (!postData) return undefined;
    
    try {
      // Try URL-encoded form data
      const params = new URLSearchParams(postData);
      const fields: Record<string, string> = {};
      
      for (const [key, value] of params.entries()) {
        fields[key] = this.redactValue(key, value);
      }
      
      return Object.keys(fields).length > 0 ? fields : undefined;
    } catch {
      return undefined;
    }
  }

  private onRequest(request: Request): void {
    const resourceType = request.resourceType();
    
    if (!this.shouldCapture(resourceType)) return;
    
    const url = request.url();
    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();
    
    const captured: CapturedRequest = {
      timestamp: new Date().toISOString(),
      url,
      method,
      resourceType,
      headers: this.redactHeaders(headers),
      postData: postData ? (this.config.redactSensitive ? '<see postDataFields>' : postData) : undefined,
      postDataFields: this.parsePostData(postData)
    };
    
    // Store for matching with response
    this.requestMap.set(`${method}:${url}`, captured);
    
    if (this.config.logToConsole) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📤 [REQ] ${method} ${url}`);
      console.log(`   Type: ${resourceType}`);
      
      // Log important headers
      const importantHeaders = ['content-type', 'cookie', 'authorization', 'referer'];
      for (const header of importantHeaders) {
        if (headers[header]) {
          console.log(`   ${header}: ${this.redactValue(header, headers[header])}`);
        }
      }
      
      // Log POST data fields
      if (captured.postDataFields) {
        console.log(`   POST fields:`);
        for (const [key, value] of Object.entries(captured.postDataFields)) {
          // Truncate long values for readability
          const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
          console.log(`      ${key}: ${displayValue}`);
        }
      }
    }
  }

  private onResponse(response: Response): void {
    const request = response.request();
    const resourceType = request.resourceType();
    
    if (!this.shouldCapture(resourceType)) return;
    
    const url = response.url();
    const method = request.method();
    const status = response.status();
    const statusText = response.statusText();
    const headers = response.headers();
    
    const captured: CapturedResponse = {
      timestamp: new Date().toISOString(),
      url,
      status,
      statusText,
      headers: this.redactHeaders(headers),
      contentType: headers['content-type']
    };
    
    // Match with request
    const requestKey = `${method}:${url}`;
    const matchedRequest = this.requestMap.get(requestKey);
    
    if (matchedRequest) {
      this.entries.push({
        request: matchedRequest,
        response: captured
      });
      this.requestMap.delete(requestKey);
    } else {
      // Request might have been redirected, store response anyway
      this.entries.push({
        request: {
          timestamp: captured.timestamp,
          url,
          method,
          resourceType,
          headers: {}
        },
        response: captured
      });
    }
    
    if (this.config.logToConsole) {
      const statusEmoji = status >= 200 && status < 300 ? '✅' : 
                          status >= 300 && status < 400 ? '↪️' : '❌';
      
      console.log(`📥 [RES] ${statusEmoji} ${status} ${statusText}`);
      console.log(`   Content-Type: ${headers['content-type'] || 'unknown'}`);
      
      // Log Set-Cookie headers (important for auth flow)
      const setCookies = Object.entries(headers).filter(([k]) => k.toLowerCase() === 'set-cookie');
      if (setCookies.length > 0) {
        console.log(`   🍪 Set-Cookie headers found:`);
        for (const [, value] of setCookies) {
          // Parse cookie name from value
          const cookieName = value.split('=')[0];
          console.log(`      ${cookieName}=<redacted>; ${value.split(';').slice(1).join(';')}`);
        }
      }
      
      // Log Location header for redirects
      if (headers['location']) {
        console.log(`   📍 Location: ${headers['location']}`);
      }
    }
  }

  /**
   * Get all captured entries
   */
  getEntries(): NetworkLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get summary of the captured flow
   */
  getSummary(): { 
    totalRequests: number;
    documents: number;
    xhrFetch: number;
    postRequests: number;
    authRelated: string[];
  } {
    const documents = this.entries.filter(e => e.request.resourceType === 'document').length;
    const xhrFetch = this.entries.filter(e => ['xhr', 'fetch'].includes(e.request.resourceType)).length;
    const postRequests = this.entries.filter(e => e.request.method === 'POST').length;
    
    // Find auth-related URLs
    const authKeywords = ['login', 'auth', 'session', 'contrasena', 'clave', 'password'];
    const authRelated = this.entries
      .filter(e => authKeywords.some(kw => e.request.url.toLowerCase().includes(kw)))
      .map(e => `${e.request.method} ${new URL(e.request.url).pathname}`);
    
    return {
      totalRequests: this.entries.length,
      documents,
      xhrFetch,
      postRequests,
      authRelated: [...new Set(authRelated)]
    };
  }

  /**
   * Save captured data to file
   */
  save(outputPath?: string): string {
    const path = outputPath || this.config.outputPath;
    
    const output = {
      capturedAt: new Date().toISOString(),
      summary: this.getSummary(),
      entries: this.entries
    };
    
    writeFileSync(path, JSON.stringify(output, null, 2));
    
    if (this.config.logToConsole) {
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`💾 Network capture saved to: ${path}`);
      console.log(`📊 Summary:`);
      console.log(`   Total requests: ${output.summary.totalRequests}`);
      console.log(`   Documents: ${output.summary.documents}`);
      console.log(`   XHR/Fetch: ${output.summary.xhrFetch}`);
      console.log(`   POST requests: ${output.summary.postRequests}`);
      console.log(`   Auth-related URLs: ${output.summary.authRelated.join(', ')}`);
    }
    
    return path;
  }

  /**
   * Clear all captured entries
   */
  clear(): void {
    this.entries = [];
    this.requestMap.clear();
  }
}

/**
 * Factory function to create and attach a network logger to a page
 */
export function createNetworkLogger(page: Page, config?: NetworkLoggerConfig): NetworkLogger {
  const logger = new NetworkLogger(config);
  logger.attach(page);
  return logger;
}
