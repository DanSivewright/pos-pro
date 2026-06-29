/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as digest from "../digest.js";
import type * as digestData from "../digestData.js";
import type * as emails_digestEmail from "../emails/digestEmail.js";
import type * as emails_emailLayout from "../emails/emailLayout.js";
import type * as health from "../health.js";
import type * as ingest from "../ingest.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_digest from "../lib/digest.js";
import type * as lib_thresholds from "../lib/thresholds.js";
import type * as storeDays from "../storeDays.js";
import type * as stores from "../stores.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  digest: typeof digest;
  digestData: typeof digestData;
  "emails/digestEmail": typeof emails_digestEmail;
  "emails/emailLayout": typeof emails_emailLayout;
  health: typeof health;
  ingest: typeof ingest;
  "lib/authz": typeof lib_authz;
  "lib/digest": typeof lib_digest;
  "lib/thresholds": typeof lib_thresholds;
  storeDays: typeof storeDays;
  stores: typeof stores;
  uploads: typeof uploads;
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
