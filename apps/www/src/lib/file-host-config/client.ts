/**
 * The one `fetch` wrapper every `file_host` caller goes through, for:
 *
 * 1. **A seam to test against.** `FileHostTransport` is the whole surface its
 *    callers need, so their tests hand them a function: no `fetch` stubbing.
 * 2. **A failure that says what failed.** A mixed-content block, a proxy with
 *    nothing behind it and a stopped `file_host` all arrive as the same opaque
 *    `TypeError: Failed to fetch`. See `lib/file-host-config`.
 * 3. **A bounded wait.** Bare `fetch` has no timeout, and a black-holed
 *    connection stays pending for minutes; `queryOutcome`'s `pending` state
 *    depends on every request settling within a deadline. It is
 *    `Promise.race`d rather than trusting `fetch` to honour `AbortSignal`,
 *    since a test seam may not (`installFileHostSabotage`'s `"hang"`).
 *
 *    The deadline lives in `requestJSON` and covers headers **and** body: a
 *    prompt response that stalls its body must still time out. "Did my
 *    deadline fire" is read from `controller.signal.aborted`, not from which
 *    rejection won, because `fetch`'s own `AbortError` can reject first.
 */

import { authority, StaleAuthorityError } from "@/lib/authority"

import type { FileHostResolution } from "."
import { describeFileHost, FileHostUnreachableError } from "."

/** The shape a mocked transport has to satisfy. */
export type FileHostTransport = (
  route: string,
  init?: RequestInit
) => Promise<Response>

/**
 * The deployment has no such feature (an unconfigured VAPID identity, most of
 * all). Distinct from `FileHostUnreachableError` ("retry later"): this server
 * will never answer, so stop asking and fall back.
 */
/** The `503` codes that are an answer, not an unconfigured feature. */
const UNAVAILABLE_ANSWERS: ReadonlySet<string> = new Set([
  "service_overloaded",
  "device_storage_unavailable",
  "device_storage_failed",
])

export class FileHostNotConfiguredError extends Error {
  constructor(route: string) {
    super(`file_host has no ${route} on this deployment`)
    this.name = "FileHostNotConfiguredError"
  }
}

/** A non-2xx answer that did come from `file_host`. */
export class FileHostResponseError extends Error {
  constructor(
    readonly status: number,
    readonly route: string,
    /** `file_host`'s own error code, e.g. `not_found`; see its `error.rs`. */
    readonly code: string | null
  ) {
    super(
      `file_host answered ${status} for ${route}${code ? ` (${code})` : ""}`
    )
    this.name = "FileHostResponseError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** `{ error: { code, message } }` - `file_host`'s envelope for every failure. */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    if (!isRecord(body) || !isRecord(body.error)) return null
    const { code } = body.error
    return typeof code === "string" ? code : null
  } catch {
    // A body that is not the envelope (an nginx 502 page, most likely)
    // still has a useful status; the code is the part that is missing.
    return null
  }
}

let unauthorizedHandler: (() => () => void) | null = null

/**
 * What to do when `file_host` answers `401` (cookie missing, expired or
 * revoked). Registered by `lib/auth`, since importing it would be a cycle.
 *
 * `handler` is called as each request is sent and returns what to run if that
 * request is refused, so a slow `401` is judged against the session it was
 * sent under, not one signed in since.
 */
export function onFileHostUnauthorized(
  handler: (() => () => void) | null
): void {
  unauthorizedHandler = handler
}

/** Long enough that a slow LAN response never trips it, short enough that a
 * route read never looks hung. Matches `@some-ui/fetch-kit`'s default; tests
 * override it with `VITE_FILE_HOST_TIMEOUT_MS`. */
const DEFAULT_FILE_HOST_TIMEOUT_MS = 10_000

/** Read on every call so a test can `vi.stubEnv` a deadline even though the
 * transport is a module-scope singleton. */
function resolveTimeoutMs(): number {
  const override: string | undefined = import.meta.env.VITE_FILE_HOST_TIMEOUT_MS
  if (override === undefined || override === "")
    return DEFAULT_FILE_HOST_TIMEOUT_MS
  const parsed = Number(override)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_FILE_HOST_TIMEOUT_MS
}

/**
 * Why a caller wants a transport. Required, so nobody gets one by default.
 *
 * - `"account"`: *learner state* (sessions, the shelf). `null` unless the data
 *   authority is the account (`lib/authority`, invariant LA1); a transport
 *   handed out refuses to send once the authority changes.
 * - `"reporting"`: behaviour rather than content (signals, a presence lease, a
 *   push subscription). `"account"`'s conditions plus the person's separate
 *   opt-in (`lib/authority`, "Reporting").
 * - `"ceremony"`: signing in, out, adding a passkey, or checking a chosen
 *   session still exists. Explicit acts that carry no learner state.
 */
export type TransportPurpose = "account" | "ceremony" | "reporting"

/**
 * Build the default transport for wherever this page is served from.
 *
 * `null` with no base URL (SSR, no `window`), or when `purpose`'s authority
 * conditions fail; callers treat that as "no backend", like the static build.
 * No timeout of its own: `requestJSON` owns the deadline (header, point 3).
 *
 * Sends `credentials: "include"`: the passkey session is an `HttpOnly` cookie
 * and a `published-port` base URL is cross-origin. Every module this reaches
 * answers with `Access-Control-Allow-Credentials` (paulgsc/server
 * `routes/cors.rs`); a caller of an uncredentialed read module
 * (`db/curriculum`, `db/activities`) must pass `credentials: "same-origin"`.
 */
export function createFileHostTransport(
  purpose: TransportPurpose,
  resolution: FileHostResolution = describeFileHost()
): FileHostTransport | null {
  const { baseUrl } = resolution
  if (baseUrl === undefined) return null
  if (purpose === "account" && !authority.is("account")) return null
  if (purpose === "reporting" && !authority.getSnapshot().reportingAllowed) {
    return null
  }
  // The authority this transport was issued under. It is checked again on every
  // send, so a transport kept across a sign-out, a switch or another account's
  // sign-in cannot carry a request into the new authority.
  const issued = authority.getAuthority()

  return async (route, init) => {
    if (purpose !== "ceremony" && !authority.isCurrent(issued)) {
      throw new StaleAuthorityError(route)
    }
    // Checked again on every send: turning reporting off stops a transport that
    // was issued while it was on.
    if (purpose === "reporting" && !authority.getSnapshot().reportingAllowed) {
      throw new StaleAuthorityError(route)
    }
    const url = `${baseUrl.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`
    try {
      return await fetch(url, {
        credentials: "include",
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      })
    } catch (cause) {
      throw new FileHostUnreachableError(route, cause)
    }
  }
}

/**
 * Whether `error` is this module's own deadline firing, as opposed to a fast
 * rejection. `providers/tanstack-query.tsx` makes a timeout terminal after one
 * attempt: retrying a black-holed connection just pays the deadline again.
 */
export function isFileHostTimeout(error: unknown): boolean {
  return (
    error instanceof FileHostUnreachableError &&
    error.cause instanceof DOMException &&
    error.cause.name === "TimeoutError"
  )
}

/**
 * `POST` is the method that mints a resource (`HttpSessionsRepository`'s
 * `create`/`duplicate`); the others converge if repeated. A timed-out `POST`
 * cannot tell "never arrived" from "created, slow response", so it is not
 * retryable.
 */
function isNonIdempotent(
  init: RequestInit | undefined,
  options: RequestOptions | undefined
): boolean {
  return options?.idempotent === undefined
    ? init?.method === "POST"
    : !options.idempotent
}

export type RequestOptions = {
  /**
   * Whether repeating this request converges, when its method says otherwise
   * (the lesson CRM's retire and restore are state-setting `POST`s). Omit it
   * to let the method decide.
   */
  idempotent?: boolean
}

/**
 * `fetch`, decode, and turn every failure into one of the three errors above,
 * with one deadline racing the whole operation (transport, status check and
 * body read; see the header, point 3).
 *
 * Every `file_host` route answers with a JSON body except the learner shelf's
 * bodiless `204` `DELETE`, which `lib/shelf-client` handles before here.
 */
export async function requestJSON<T>(
  transport: FileHostTransport,
  route: string,
  init?: RequestInit,
  options?: RequestOptions
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), resolveTimeoutMs())

  const onUnauthorized = unauthorizedHandler?.()
  const operation = async (): Promise<T> => {
    const response = await transport(route, {
      ...init,
      signal: controller.signal,
    })

    if (response.status === 503) {
      // `503` is either an unconfigured feature or a real answer: a busy
      // server, a spent quota such as the daily new-account cap
      // (`service_overloaded`), or, in the Android app, its own storage
      // failing (`device-backend/interceptor`).
      const code = await errorCodeOf(response)
      if (code !== null && UNAVAILABLE_ANSWERS.has(code)) {
        throw new FileHostResponseError(503, route, code)
      }
      throw new FileHostNotConfiguredError(route)
    }
    if (response.status === 401) onUnauthorized?.()
    if (!response.ok) {
      throw new FileHostResponseError(
        response.status,
        route,
        await errorCodeOf(response)
      )
    }

    // No schema here: the caller's `T` is its claim about the route, and
    // narrowing happens where the shape is known.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return response.json()
  }

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        // Settles the race when the deadline fires, whether or not the
        // transport honours `controller.signal` (header, point 3).
        controller.signal.addEventListener("abort", () => {
          reject(
            new DOMException(
              `file_host did not answer ${route} within the deadline`,
              "TimeoutError"
            )
          )
        })
      }),
    ])
  } catch (cause) {
    if (
      cause instanceof FileHostNotConfiguredError ||
      cause instanceof FileHostResponseError
    ) {
      throw cause
    }
    // A fired signal *is* this deadline, whichever rejection won the race.
    if (controller.signal.aborted) {
      throw new FileHostUnreachableError(
        route,
        new DOMException(
          `file_host did not answer ${route} within the deadline`,
          "TimeoutError"
        ),
        // Not retryable for a non-idempotent write (`isNonIdempotent`).
        !isNonIdempotent(init, options)
      )
    }
    throw new FileHostUnreachableError(route, cause)
  } finally {
    clearTimeout(timeoutId)
  }
}
