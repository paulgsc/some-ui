/**
 * Where this build's `file_host` backend (paulgsc/server) lives: the base URL
 * to prefix `/sessions` and `/push` with. A near-copy of `lib/tts-config`,
 * the same problem on a different port.
 *
 * The study origin is necessarily HTTPS (service workers, `Notification` and
 * `PushManager` need a secure context) and `file_host` serves plain HTTP on
 * 3000, so a direct request is mixed content, blocked before it leaves the
 * page. It looks like the server being down or CORS, but **no server-side
 * CORS change can fix mixed content**.
 *
 * So, by scheme:
 *
 * - **HTTPS page** -> the same-origin `FILE_HOST_PROXY_PATH`, proxied by
 *   nginx.https.conf and by `vite dev`/`vite preview` (vite.config.ts).
 * - **HTTP page** -> `http://<hostname>:3000` directly (Storybook, cert-less
 *   `vite dev`, the container's port-80 listener).
 *
 * `VITE_FILE_HOST_ENDPOINT` overrides both, like `VITE_TTS_ENDPOINT`.
 */
import type { RouteParams, ServerRoute } from "@some-ui/fetch-kit"
import { API_V1_PREFIX } from "@some-ui/fetch-kit"

/**
 * How a read of *public corpus content* is made (lessons, rounds, the vocab
 * file): with no credentials. Otherwise the `/api/file-host` proxy would send
 * the session cookie, and the operator would see a device learner and an
 * account holder as the same visitor. Spread into a data source's
 * `fetchOptions`.
 */
export const PUBLIC_READ: { readonly credentials: RequestCredentials } = {
  credentials: "omit",
}
/** The port `file_host` listens on. */
export const DEFAULT_FILE_HOST_PORT = 3000

/**
 * Same-origin prefix that reverse-proxies to `file_host`. Kept in step by
 * hand with nginx.https.conf's `location` blocks, vite.config.ts's
 * `server.proxy`, and `public/sw.js` (which rebuilds it from
 * `self.registration.scope`; see the note beside `NUDGE_TAG` there).
 */
export const FILE_HOST_PROXY_PATH = "/api/file-host"

function baseForCurrentHost(): string | undefined {
  if (typeof window === "undefined") return undefined
  const { hostname, protocol } = window.location
  if (protocol === "https:") return `${FILE_HOST_PROXY_PATH}${API_V1_PREFIX}`
  return `http://${hostname}:${DEFAULT_FILE_HOST_PORT}${API_V1_PREFIX}`
}

/**
 * Which rule produced the base URL. Reported because `override` fails
 * silently: a stale `VITE_FILE_HOST_ENDPOINT` beats every default, with a 404
 * as the only evidence.
 */
type FileHostSource =
  | "override"
  | "same-origin-proxy"
  | "published-port"
  | "unavailable"

export type FileHostResolution = {
  baseUrl: string | undefined
  source: FileHostSource
}

export function describeFileHost(): FileHostResolution {
  const configured = import.meta.env.VITE_FILE_HOST_ENDPOINT
  if (configured) return { baseUrl: configured, source: "override" }

  const baseUrl = baseForCurrentHost()
  if (baseUrl === undefined) return { baseUrl, source: "unavailable" }
  return {
    baseUrl,
    source: baseUrl.startsWith(FILE_HOST_PROXY_PATH)
      ? "same-origin-proxy"
      : "published-port",
  }
}

export function resolveFileHostBase(): string | undefined {
  return describeFileHost().baseUrl
}

/**
 * Join the base with a route, tolerating a trailing slash on either side:
 * `//sessions` is a confusing 404 on `file_host`.
 */
export function fileHostUrl(route: string): string | undefined {
  const base = resolveFileHostBase()
  if (base === undefined) return undefined
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`
}

/**
 * `fileHostUrl` for a route named exactly as the server names it.
 *
 * Keeps `apiUrl`'s `ServerRoute` type check (`@some-ui/fetch-kit`), but joins
 * onto `resolveFileHostBase()`: `apiUrl` resolves `/api/v1/...` as absolute,
 * dropping the proxy base's own path. Placeholders are bound URI-encoded.
 */
export function fileHostRouteUrl<P extends ServerRoute>(
  route: P,
  ...params: RouteParams<P> extends never
    ? []
    : [Record<RouteParams<P>, string | number>]
): string | undefined
// Plain implementation signature, for the reason `apiUrl` gives for its own:
// the conditional tuple above is unresolved inside a generic body.
export function fileHostRouteUrl(
  route: string,
  params?: Record<string, string | number>
): string | undefined {
  const bound = route
    .slice(API_V1_PREFIX.length)
    .replace(/:([A-Za-z_]\w*)/g, (_, name: string) =>
      encodeURIComponent(String(params?.[name]))
    )
  return fileHostUrl(bound)
}

/**
 * A `fetch` rejection (mixed content, a dead proxy, a stopped backend) in
 * words that name `file_host`, rather than an opaque `Failed to fetch`.
 */
export class FileHostUnreachableError extends Error {
  constructor(
    route: string,
    cause?: unknown,
    /**
     * `false` only for `requestJSON`'s deadline firing on a non-idempotent
     * write (`POST`: `create`/`duplicate`): `file_host` may already have
     * processed it, so a retry could duplicate a session. A request that
     * never reached the server is safe to retry regardless of method.
     */
    readonly retryable: boolean = true
  ) {
    super(
      `file_host did not answer ${route}. Is it running, and is ${FILE_HOST_PROXY_PATH} proxied to it?`
    )
    this.name = "FileHostUnreachableError"
    this.cause = cause
  }
}
