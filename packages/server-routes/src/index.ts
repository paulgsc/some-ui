/**
 * @module server-routes
 *
 * Re-exports `paulgsc/server`'s HTTP route surface, generated verbatim into
 * `./generated/routes.ts` by that repo's `dump-routes -- --ts` (server#266).
 * This file is the only hand-written source in the package; everything it
 * re-exports comes from the generated sibling, untouched.
 *
 * See this package's README for why it exists as its own dependency-free
 * package rather than living inside `fetch-kit` or `contract-harness`
 * (some-ui#1040).
 */

export { API_BASE_PATH } from "./generated/routes"
export type { ServerRoute, UnversionedRoute } from "./generated/routes"
