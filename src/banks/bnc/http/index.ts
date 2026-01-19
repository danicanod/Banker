/**
 * BNC HTTP Module
 * 
 * Pure HTTP-based client for BNC online banking.
 * Use this for faster authentication and scraping without browser overhead.
 */

export {
  BncHttpClient,
  createBncHttpClient,
  quickHttpLogin,
} from './bnc-http-client.js';

export type {
  BncHttpConfig,
  BncHttpLoginResult,
  BncPreLoginResponse,
  BncLoginResponse
} from './bnc-http-client.js';
