import type { ServerRoute, UnversionedRoute } from "@some-ui/server-routes"
import { API_BASE_PATH } from "@some-ui/server-routes"

/**
 * Re-exported under its historical name: `apps/www/src/lib/file-host-config`
 * builds a base URL by hand from this constant (`${proxyPath}${API_V1_PREFIX}`),
 * not through `apiUrl`, so the name stays put. Aliased rather than
 * redeclared so the two can never drift apart.
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

/**
 * Builds a `file_host` API URL from one of the server's own routes
 * (server#266, some-ui#1040). `ServerRoute` members are already the full
 * path, `/api/v1` included, so this only resolves the base URL - it does not
 * concatenate a prefix.
 *
 * `P extends ServerRoute` is what turns a typo, or a path the server does
 * not actually have, into a `tsc` error instead of a 404 discovered days
 * later. `apiUrl` only accepts *versioned* routes on purpose - see
 * `unversionedApiUrl` below for `/health`, `/ready`, `/ws`.
 *
 * The `params` argument required for a path with placeholders is a
 * compile-time completeness proof, not a substitution input: this function
 * still returns a URL with every `:name` placeholder intact, exactly as it
 * always has. Binding them to real values stays `createQueryHook`'s job (see
 * `query-hooks/index.ts`, and `contract-harness/src/contract.ts`'s note on
 * `bindPath`, which documents the identical split on the contract side) -
 * real values are usually only known at render time, which is after
 * `apiUrl` has already run at module scope. Requiring the argument here
 * exists purely so a caller cannot forget a placeholder the path actually
 * has; a static path (`Params<P>` is `never`) takes no such argument, so the
 * dozens of parameterless call sites aren't forced to pass `{}`.
 */
export function apiUrl<P extends ServerRoute>(
  path: P,
  ...rest: Params<P> extends never
    ? [baseUrl?: string]
    : [params: Record<Params<P>, string | number>, baseUrl?: string]
): URL
// Separately-typed implementation signature, on purpose: `rest`'s precise
// shape above depends on `Params<P>`, which is not resolved yet inside a
// still-generic function body, so the body needs its own plain parameter
// types rather than trying to read the conditional tuple directly. Nothing
// unsound falls out of that - every call site was already checked against
// the precise overload above, where `P` was a concrete literal; this second
// signature is invisible to callers (TypeScript hides the implementation
// signature of an overloaded function), so it only has to be a safe
// *superset* of what the overload allows through.
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
 * Deliberately a separate function rather than an overload sharing
 * `apiUrl`'s name: an overload set keyed only on the argument type would let
 * a caller pass an `UnversionedRoute` wherever a `ServerRoute` is expected
 * (or vice versa) the moment the two string unions happened to overlap,
 * which is exactly the "cannot be prefixed by accident" property
 * some-ui#1040 asks for. Two differently-named functions make picking the
 * wrong one a `tsc` error instead of a runtime 404.
 */
export function unversionedApiUrl(
  path: UnversionedRoute,
  baseUrl?: string
): URL {
  return new URL(path, baseUrl ?? DEFAULT_API_BASE_URL)
}
