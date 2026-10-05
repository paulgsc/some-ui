import type { ServerRoute, UnversionedRoute } from "@some-ui/server-routes"
import { API_BASE_PATH } from "@some-ui/server-routes"

/**
 * Re-exported so an app can name a route by the server's own type without
 * taking a second dependency for it; `@some-ui/server-routes` stays the one
 * place the union is generated into.
 */
export type { ServerRoute } from "@some-ui/server-routes"

/**
 * Kept under this name for `apps/www/src/lib/file-host-config`, which builds
 * a base URL by hand from it. Aliased, not redeclared, so the two cannot drift.
 */
export const API_V1_PREFIX = API_BASE_PATH

export const DEFAULT_API_BASE_URL = "http://nixos.local:3000"

/**
 * Every `:name` placeholder in a route template, as a union of bare names -
 * `never` for a path with none. `ServerRoute` members already carry the
 * server's own `:name` syntax verbatim (see `@some-ui/server-routes`), so
 * this operates directly on them rather than on some derived shape.
 */
type Params<P extends string> =
  P extends `${string}:${infer Name}/${infer Rest}`
    ? Name | Params<`/${Rest}`>
    : P extends `${string}:${infer Name}`
      ? Name
      : never

/** `Params`, for a caller that binds a route's placeholders itself. */
export type RouteParams<P extends string> = Params<P>

/**
 * Builds a `file_host` API URL from one of the server's own routes. Members
 * of `ServerRoute` are already full paths (`/api/v1` included), so only the
 * base URL is resolved. A typo or a path the server lacks is a `tsc` error,
 * not a 404. Versioned routes only: see `unversionedApiUrl`.
 *
 * `params` is a compile-time completeness proof, not a substitution: the URL
 * keeps its `:name` placeholders, which `createQueryHook` binds at render
 * time (as `contract-harness/src/contract.ts`'s `bindPath` does). A static
 * path takes no `params` argument.
 */
export function apiUrl<P extends ServerRoute>(
  path: P,
  ...rest: Params<P> extends never
    ? [baseUrl?: string]
    : [params: Record<Params<P>, string | number>, baseUrl?: string]
): URL
// Separately-typed implementation: `Params<P>` is unresolved in a generic
// body. Callers only see the overload above, so this need only be a safe
// superset of it.
export function apiUrl(
  path: string,
  paramsOrBaseUrl?: Record<string, string | number> | string,
  maybeBaseUrl?: string
): URL {
  const baseUrl =
    typeof paramsOrBaseUrl === "string" ? paramsOrBaseUrl : maybeBaseUrl
  return new URL(path, baseUrl ?? DEFAULT_API_BASE_URL)
}

/**
 * The `/health` / `/ready` / `/ws` counterpart to `apiUrl`.
 *
 * A separate function, not an overload: overlapping string unions would let
 * one kind of route pass for the other. Two names make the wrong pick a
 * `tsc` error instead of a 404.

 */
export function unversionedApiUrl(
  path: UnversionedRoute,
  baseUrl?: string
): URL {
  return new URL(path, baseUrl ?? DEFAULT_API_BASE_URL)
}
