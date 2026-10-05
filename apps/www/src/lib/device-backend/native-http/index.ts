/**
 * `HomeGet` over Capacitor's native HTTP, for the sync from home.
 *
 * Native rather than `fetch` because the app's page is `https://localhost`
 * and home is a plain-`http:` LAN address: the WebView blocks that `fetch`
 * as mixed content, and the server's CORS allowlist would have to name the
 * app's origin besides. A native request is neither. (Android's own
 * cleartext policy still applies to it; `AndroidManifest.xml` allows
 * cleartext for exactly this.)
 *
 * The plugin parses any `application/json` answer whatever `responseType`
 * asks for (`HttpRequestHandler.readData`), so `data` may arrive as an
 * object; it is re-serialised here, and `home-sync` stores Leetype rounds
 * against the server's attested hash for that reason.
 */
import { CapacitorHttp } from "@capacitor/core"

import type { HomeGet } from "@/lib/device-backend/home-sync"

/** Long enough for a slow LAN; short enough to say "unreachable" promptly. */
const TIMEOUT_MS = 10_000

export const nativeHomeGet: HomeGet = async (url) => {
  const response = await CapacitorHttp.get({
    url,
    responseType: "text",
    connectTimeout: TIMEOUT_MS,
    readTimeout: TIMEOUT_MS,
  })
  const { data } = response
  const body: string = typeof data === "string" ? data : JSON.stringify(data)
  return { status: response.status, body }
}
