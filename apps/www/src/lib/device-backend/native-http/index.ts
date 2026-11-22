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
 * - **Only silence is no answer** (NA1, #3099): a refused connection or a
 *   timeout is `HomeNoAnswerError`, which the link reads as away (AW1); a
 *   name this phone can't find or a certificate it doesn't trust is
 *   `HomeBlockedError`, said as itself.
 * - **Every network is asked before home is said unreachable** (NA2,
 *   #3411): a request that found no answer or no name goes once more over
 *   the phone's other networks, Wi-Fi first (`./route`), since Android can
 *   put this app's traffic on mobile data while the phone is on home's
 *   Wi-Fi. Their answer is home's; Android keeping the app off every one is
 *   `HomeBlockedError` `held`.
 *
 * The plugin parses any `application/json` answer regardless of
 * `responseType`, so `body` is re-serialised here.
 */
import type { HttpResponse } from "@capacitor/core"
import { CapacitorHttp } from "@capacitor/core"
import type { HomeAnswer, HomeBytes, HomeRange } from "@some-ui/core-utils"
import { isHomeBytes } from "@some-ui/core-utils"
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import {
  ForeignCallError,
  foreignValue,
  isMissingPlugin,
} from "@/lib/intent/foreign"

import type { HomeBlockedReason } from "./no-answer"
import {
  blockedReason,
  HomeBlockedError,
  HomeNoAnswerError,
  phoneOnline,
} from "./no-answer"
import { routeElsewhere } from "./route"

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
   * byte for byte and home's content hash matches the phone's). `HomeBytes`
   * go as their own media type, the plugin decoding the base64 (on Android 8
   * and later; Android 7's plugin sends an empty body, which home refuses).
   */
  body?: unknown
  /** Sent as `If-None-Match`. */
  ifNoneMatch?: string
  /**
   * Sent as `Range: bytes=start-end`: the answer's body is those bytes as
   * base64, read as the plugin's `blob`, so a large file comes a part at a
   * time and is never held whole. `"whole"` sends no `Range` and reads all
   * of a small file as base64 the same way.
   */
  range?: HomeRange
}

/** A credentialed request to a URL that is not `https:`. Nothing was sent. */
class InsecureHomeError extends Error {
  constructor() {
    super("the home server's credential is sent over https only")
    this.name = "InsecureHomeError"
  }
}

/** What a `HomeBlockedReason` failure is, as the native log reads it. */
const BLOCKED: Readonly<Record<HomeBlockedReason, string>> = {
  name: "This phone couldn't look up home's name on this network.",
  trust: "This phone doesn't trust home's certificate.",
  door: "Home's address answered, but home's server didn't.",
  held: "This phone keeps the app off the network.",
}

function classify(error: unknown): ForeignVerdict {
  const blocked = blockedReason(error, phoneOnline())
  if (blocked !== null) {
    // Not home's silence (NA1): a network or certificate change mends it,
    // so asking again can succeed.
    return { kind: "rejected", retryable: true, summary: BLOCKED[blocked] }
  }
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
  // Home's silence is the link's to tell, once a stretch away (AW1,
  // `lib/home-link/away`), and so is a name or a certificate that stopped
  // a request (NA1); every other failure is told here.
  report: (failure) => {
    if (failure.error.kind === "unreachable") return
    if (blockedReason(failure.error.cause, phoneOnline()) !== null) return
    reportFailure(failure)
  },
}

export async function homeRequest(call: HomeRequest): Promise<HomeAnswer> {
  const { method, url, token, body, ifNoneMatch, range } = call
  if (token !== undefined && new URL(url).protocol !== "https:") {
    throw new InsecureHomeError()
  }
  const headers: Record<string, string> = {}
  if (token !== undefined) headers.Authorization = `Bearer ${token}`
  const bytes = isHomeBytes(body) ? body : null
  if (body !== undefined) {
    headers["Content-Type"] = bytes?.contentType ?? "application/json"
  }
  if (ifNoneMatch !== undefined) headers["If-None-Match"] = ifNoneMatch
  if (range !== undefined && range !== "whole") {
    headers.Range = `bytes=${String(range.start)}-${String(range.end)}`
  }
  const options = {
    method,
    url,
    headers,
    responseType: range === undefined ? ("text" as const) : ("blob" as const),
  }
  const answer = await foreignValue(
    callForeign({
      port: PORT,
      // The plugin's own timeouts, plus room for it to report them.
      deadlineMs: 2 * TIMEOUT_MS + 1_000,
      start: () =>
        CapacitorHttp.request({
          ...options,
          ...(bytes !== null
            ? { data: bytes.base64, dataType: "file" as const }
            : body === undefined
              ? {}
              : { data: body }),
          disableRedirects: true,
          connectTimeout: TIMEOUT_MS,
          readTimeout: TIMEOUT_MS,
        }),
    }),
    (error) => {
      if (error.kind === "unreachable") return new HomeNoAnswerError(error)
      // `classify` already read the network: a `rejected` is a blocked one.
      const blocked = blockedReason(error.cause)
      return blocked === null
        ? new ForeignCallError(error)
        : new HomeBlockedError(error, blocked)
    }
  ).catch((error: unknown) => elsewhere(error, options, bytes, body))
  const { data } = answer
  const header = (wanted: string): string | undefined =>
    Object.entries(answer.headers).find(
      ([name]) => name.toLowerCase() === wanted
    )?.[1]
  const etag = header("etag")
  const retryAfter = header("retry-after")
  return {
    status: answer.status,
    body: typeof data === "string" ? data : JSON.stringify(data),
    ...(etag === undefined ? {} : { etag }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
  }
}

/**
 * `failed`'s request asked once more over the phone's other networks (NA2),
 * when it found no answer or no name: their answer, as the plugin's own
 * would be; `held` when Android keeps the app off them all; else `failed`.
 */
async function elsewhere(
  failed: unknown,
  options: {
    method: string
    url: string
    headers: Record<string, string>
    responseType: "text" | "blob"
  },
  bytes: HomeBytes | null,
  body: unknown
): Promise<HttpResponse> {
  const asked =
    failed instanceof HomeNoAnswerError ||
    (failed instanceof HomeBlockedError && failed.reason === "name")
  if (!asked) throw failed
  const routed = await routeElsewhere({
    ...options,
    timeout: TIMEOUT_MS,
    ...(bytes !== null
      ? { data: bytes.base64, dataType: "file" as const }
      : body === undefined
        ? {}
        : { data: typeof body === "string" ? body : JSON.stringify(body) }),
  })
  if (routed.kind === "answered") {
    const { status, headers, data } = routed.answer
    return { status, headers, data, url: options.url }
  }
  if (routed.kind === "held") {
    throw new HomeBlockedError(
      {
        kind: "rejected",
        retryable: true,
        summary: BLOCKED.held,
        cause: failed,
      },
      "held"
    )
  }
  throw failed
}
