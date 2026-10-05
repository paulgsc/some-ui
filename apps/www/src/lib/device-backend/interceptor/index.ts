/**
 * Answers this app's `file_host` requests in-process, so the device build
 * runs every server-mode code path unchanged with no network.
 *
 * Every `file_host` caller ends in a plain `fetch` of `<base>/<route>`, so
 * wrapping `fetch` once covers them all. Anything outside `base` (a font, the
 * vocab file, TTS) goes to the real `fetch`. Requests wait until `backend` is
 * ready (opened, migrated, seeded), so the first `/auth/session` probe cannot
 * race the schema.
 */
import type { DeviceContext, DeviceRouter } from "@/lib/device-backend/router"
import { errorResponse } from "@/lib/device-backend/router"

export type DeviceBackend = { router: DeviceRouter; context: DeviceContext }

type Fetch = typeof fetch

function requestUrl(input: Parameters<Fetch>[0], origin: string): URL {
  if (input instanceof URL) return input
  if (typeof input === "string") return new URL(input, origin)
  return new URL(input.url, origin)
}

async function requestBody(
  input: Parameters<Fetch>[0],
  init: RequestInit | undefined
): Promise<string> {
  const body = init?.body
  if (body === undefined || body === null) {
    return input instanceof Request ? input.text() : ""
  }
  if (typeof body === "string") return body
  return new Response(body).text()
}

/**
 * `fetch`, answering requests under `base` from `backend` and passing every
 * other one to `realFetch`. Exported apart from the install so tests can
 * drive it without touching the global.
 */
export function createDeviceFetch(
  base: URL,
  backend: () => Promise<DeviceBackend>,
  realFetch: Fetch
): Fetch {
  const prefix = base.pathname.replace(/\/+$/, "")
  return async (input, init) => {
    const url = requestUrl(input, base.origin)
    const inScope =
      url.origin === base.origin &&
      (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
    if (!inScope) return realFetch(input, init)

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase()
    const path = url.pathname.slice(prefix.length) || "/"
    try {
      const { router, context } = await backend()
      const body = await requestBody(input, init)
      return await router.handle(method, path, url.searchParams, body, context)
    } catch (error) {
      // A handler bug answers like a server fault, naming the route, not like
      // "file_host unreachable".
      // eslint-disable-next-line no-console -- visible in a dev build's WebView inspector; the production minifier drops it
      console.error("device backend:", method, path, error)
      return errorResponse(500, "operation_error")
    }
  }
}

/**
 * Replaces `globalThis.fetch` for the rest of the page's life. Called once,
 * before the app renders, by the device build's entry (`device-backend`).
 */
export function installDeviceFetch(
  base: URL,
  backend: () => Promise<DeviceBackend>
): void {
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = createDeviceFetch(base, backend, realFetch)
}
