/**
 * The phone's one way to the home server: Capacitor's native HTTP. A `fetch`
 * from `https://localhost` to a plain-`http:` LAN address is mixed content
 * (and would need CORS). Android's cleartext policy still applies;
 * `AndroidManifest.xml` allows it, for the credential-free sync only.
 *
 * Nothing here decides to send: every call starts from a tap (the sync, the
 * pairing and what it lets the phone send; `lib/home-link`, LA8). This module
 * holds three rules for whatever calls it:
 *
 * - **The credential travels over https only.** A request carrying `token`
 *   to an `http:` URL is refused before anything is sent.
 * - **No redirect is followed,** so a token never follows one to another
 *   origin, and a read never lands somewhere the person did not name.
 * - **Every wait is bounded** (`callForeign`).
 *
 * The plugin parses any `application/json` answer regardless of
 * `responseType`, so `body` is re-serialised here, and `home-sync` stores
 * rounds against the server's attested hash.
 */
import { CapacitorHttp } from "@capacitor/core"
import type { HomeAnswer } from "@some-ui/core-utils"
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import { foreignValue, isMissingPlugin } from "@/lib/intent/foreign"

/** Long enough for a slow LAN; short enough to say "unreachable" promptly. */
const TIMEOUT_MS = 10_000

/** One request as the plugin sends it; the phone's exchanges send `HomeCall`s. */
export type HomeRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  /** The pairing's session token, sent as `Authorization: Bearer`. */
  token?: string
  /**
   * Sent as JSON: an object serialised, a string as its own bytes (the
   * plugin writes a string `data` unchanged, so a kept shelf body arrives
   * byte for byte and home's content hash matches the phone's).
   */
  body?: unknown
  /** Sent as `If-None-Match`. */
  ifNoneMatch?: string
}

/** A credentialed request to a URL that is not `https:`. Nothing was sent. */
class InsecureHomeError extends Error {
  constructor() {
    super("the home server's credential is sent over https only")
    this.name = "InsecureHomeError"
  }
}

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "The home server didn't answer in time.",
    }
  }
  return isMissingPlugin(error)
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "This build of the app can't reach a home server.",
      }
    : {
        kind: "unreachable",
        retryable: true,
        summary: "Couldn't reach the home server.",
      }
}

const PORT: ForeignPort = {
  name: "home server (native http)",
  classify,
  report: reportFailure,
}

export async function homeRequest(call: HomeRequest): Promise<HomeAnswer> {
  const { method, url, token, body, ifNoneMatch } = call
  if (token !== undefined && new URL(url).protocol !== "https:") {
    throw new InsecureHomeError()
  }
  const headers: Record<string, string> = {}
  if (token !== undefined) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (ifNoneMatch !== undefined) headers["If-None-Match"] = ifNoneMatch
  const answer = await foreignValue(
    callForeign({
      port: PORT,
      // The plugin's own timeouts, plus room for it to report them.
      deadlineMs: 2 * TIMEOUT_MS + 1_000,
      start: () =>
        CapacitorHttp.request({
          method,
          url,
          headers,
          ...(body === undefined ? {} : { data: body }),
          responseType: "text",
          disableRedirects: true,
          connectTimeout: TIMEOUT_MS,
          readTimeout: TIMEOUT_MS,
        }),
    })
  )
  const { data } = answer
  const etag = Object.entries(answer.headers).find(
    ([name]) => name.toLowerCase() === "etag"
  )?.[1]
  return {
    status: answer.status,
    body: typeof data === "string" ? data : JSON.stringify(data),
    ...(etag === undefined ? {} : { etag }),
  }
}
