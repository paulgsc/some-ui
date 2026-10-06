/**
 * `HomeGet` over Capacitor's native HTTP, for the sync from home: a `fetch`
 * from `https://localhost` to a plain-`http:` LAN address is mixed content
 * (and would need CORS). Android's cleartext policy still applies;
 * `AndroidManifest.xml` allows it.
 *
 * The plugin parses any `application/json` answer regardless of
 * `responseType`, so `data` is re-serialised here, and `home-sync` stores
 * rounds against the server's attested hash.
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
