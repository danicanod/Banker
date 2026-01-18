/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _logger from "../_logger.js";
import type * as cleanup_movimientos from "../cleanup_movimientos.js";
import type * as crons from "../crons.js";
import type * as notion from "../notion.js";
import type * as notion_movimientos from "../notion_movimientos.js";
import type * as notion_movimientos_mutations from "../notion_movimientos_mutations.js";
import type * as notion_mutations from "../notion_mutations.js";
import type * as sync from "../sync.js";
import type * as transactions from "../transactions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _logger: typeof _logger;
  cleanup_movimientos: typeof cleanup_movimientos;
  crons: typeof crons;
  notion: typeof notion;
  notion_movimientos: typeof notion_movimientos;
  notion_movimientos_mutations: typeof notion_movimientos_mutations;
  notion_mutations: typeof notion_mutations;
  sync: typeof sync;
  transactions: typeof transactions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
