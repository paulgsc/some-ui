/**
 * Where this build's `file_host` backend lives, and nothing else about it.
 *
 * `file_host` (paulgsc/server) is where sessions and push subscriptions
 * live once this app has a backend at all. This module answers one
 * question - what base URL do I prefix `/sessions` and `/push` with - and
 * it is a near-copy of `lib/tts-config` on purpose, because it is the same
 * problem with a different port and this repository has already paid for
 * the lesson once:
 *
 * > **HTTPS page** -> the same-origin `TTS_PROXY_PATH`, because a
 * > cross-origin `http://host:5050` request from an HTTPS document is mixed
 * > content and the browser blocks it outright. That was the actual
 * > failure: the topik applet on https://nixos.local:5173 went silent with
 * > nothing in the UI to say why, while the identical build on plain HTTP
 * > spoke fine.
 *
 * The study origin is *necessarily* HTTPS - service workers,
 * `Notification` and `PushManager` are all gated on a secure context, and
 * `http://nixos.local` is not one - so for this module the HTTPS branch is
 * not the edge case, it is the whole feature. `file_host` serves plain HTTP
 * on port 3000, so every request from the study origin would be mixed
 * content, blocked before it reaches the network.
 *
 * That is the failure worth naming here rather than rediscovering, because
 * it does not look like itself: a blocked request surfaces as a console
 * warning and a rejected promise, indistinguishable from the server being
 * down or from CORS. The likely response is to go and change
 * `ALLOWED_ORIGINS` on a server that was configured correctly. **No
 * server-side CORS change can fix mixed content** - the request never
 * leaves the page.
 *
 * So, by scheme:
 *
 * - **HTTPS page** -> the same-origin `FILE_HOST_PROXY_PATH`. Both the www
 *   container (apps/www/nginx.https.conf) and `vite dev`/`vite preview`
 *   (apps/www/vite.config.ts) proxy that path to `file_host`.
 * - **HTTP page** -> `http://<hostname>:3000` directly, the port `file_host`
 *   listens on. Storybook, cert-less `vite dev` and the www container's own
 *   port-80 listener are all plain HTTP with no proxy of their own, and
 *   none of them has a mixed-content problem to solve.
 *
 * `VITE_FILE_HOST_ENDPOINT` overrides both, for a deployment that fronts
 * `file_host` somewhere else entirely - the same escape hatch
 * `VITE_TTS_ENDPOINT` is.
 */
import { API_V1_PREFIX } from "@some-ui/fetch-kit"

/** The port `file_host` listens on. */
export const DEFAULT_FILE_HOST_PORT = 3000

/**
 * Same-origin prefix that reverse-proxies to `file_host`. Kept in step by
 * hand with the `location` blocks in apps/www/nginx.https.conf and the
 * `server.proxy` entry in apps/www/vite.config.ts - changing it means
 * changing all three.
 *
 * There is a fourth reader that cannot import this constant:
 * `public/sw.js`, which is a plain public/ asset. It rebuilds this path
 * from `self.registration.scope` for the snooze POST; see the note beside
 * `NUDGE_TAG` there.
 */
export const FILE_HOST_PROXY_PATH = "/api/file-host"

function baseForCurrentHost(): string | undefined {
  if (typeof window === "undefined") return undefined
  const { hostname, protocol } = window.location
  if (protocol === "https:") return `${FILE_HOST_PROXY_PATH}${API_V1_PREFIX}`
  return `http://${hostname}:${DEFAULT_FILE_HOST_PORT}${API_V1_PREFIX}`
}

/**
 * Which of the rules above produced the base URL.
 *
 * Reported rather than inferred from the URL for the same reason
 * `describeTTSEndpoint` reports it: the one that goes wrong silently is
 * `override`, and a stale `VITE_FILE_HOST_ENDPOINT` beats every default
 * here by design, with a 404 on a path nobody serves as the only evidence.
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
 * Join the base with a route, tolerating a trailing slash on either side.
 *
 * Trivial, and it exists anyway: an override supplied with a trailing
 * slash produces `//sessions`, which most servers route and `file_host`
 * does not, and that is a confusing 404 to debug for a stray character.
 */
export function fileHostUrl(route: string): string | undefined {
  const base = resolveFileHostBase()
  if (base === undefined) return undefined
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`
}

/**
 * What went wrong, in words that name `file_host`.
 *
 * A `fetch` rejection from any of the causes this module exists for -
 * mixed content, a dead proxy upstream, a backend that is not running -
 * arrives as the same opaque `TypeError: Failed to fetch`. Wrapping it
 * means the one message a person sees says which backend was being talked
 * to, which is the difference between checking `file_host` and rewriting
 * CORS rules on a server that was fine.
 */
export class FileHostUnreachableError extends Error {
  constructor(route: string, cause?: unknown) {
    super(
      `file_host did not answer ${route}. Is it running, and is ${FILE_HOST_PROXY_PATH} proxied to it?`
    )
    this.name = "FileHostUnreachableError"
    this.cause = cause
  }
}
