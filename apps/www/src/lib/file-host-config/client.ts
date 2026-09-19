/**
 * The one `fetch` wrapper every `file_host` caller goes through.
 *
 * It exists for three reasons, and the last two are the ones that earn the
 * file:
 *
 * 1. **A seam to test against.** `FileHostTransport` is the whole surface
 *    the sessions repository and the push subscription need, so their tests
 *    hand them a function and assert on what was called - no `global.fetch`
 *    stubbing, no jsdom, no network.
 * 2. **A failure that says what failed.** Everything this module exists to
 *    survive - a mixed-content block, a proxy with nothing behind it, a
 *    `file_host` that is not running - arrives at the caller as the same
 *    opaque `TypeError: Failed to fetch`. Left bare, the visible symptom is
 *    "sessions don't load" with a browser console warning about CORS that
 *    sends the reader to the wrong repository. See `lib/file-host-config`.
 * 3. **A bounded wait.** Bare `fetch` has no default timeout - a request
 *    against a black-holed connection (the LAN box is powered off but the
 *    switch still answers ARP, a proxy holding the socket open with nothing
 *    behind it) stays pending until the browser gives up, which can be
 *    minutes. Every route-arrival outcome downstream of this transport
 *    (`queryOutcome`'s `pending` state, in particular) depends on this
 *    settling one way or another within a declared deadline - see the
 *    route-arrival handoff (r1) and #911, whose original 13-site raw-`fetch`
 *    census missed this file entirely. `Promise.race`d against the timeout
 *    rather than relying solely on `fetch` honoring `AbortSignal`: a real
 *    browser's `fetch` does, but nothing here can assume every caller of
 *    this module's own test seam does too (see `installFileHostSabotage`'s
 *    `"hang"` mode), and the deadline must hold either way.
 *
 *    The deadline lives in `requestJSON`, not inside `createFileHostTransport`
 *    itself, and covers the *whole* logical request - headers **and** body.
 *    A first version scoped it to just the `fetch()` call and cleared it the
 *    moment headers arrived; `file_host` sending headers promptly and then
 *    stalling the JSON body (a slow disk read, a wedged connection after the
 *    response started) left `response.json()` with no protection at all,
 *    which is exactly the kind of non-settling dependency this deadline
 *    exists to bound. `controller.signal.aborted` (not the specific error
 *    that happened to win the race) is what `requestJSON` checks to decide
 *    "did my own deadline fire" - `fetch` reacting to that same abort can
 *    reject first, with its own `AbortError`, depending on microtask timing,
 *    and that must still count as this deadline, not a different failure.
 */

import type { FileHostResolution } from "."
import { describeFileHost, FileHostUnreachableError } from "."

/** The shape a mocked transport has to satisfy. */
export type FileHostTransport = (
  route: string,
  init?: RequestInit
) => Promise<Response>

/**
 * A response the caller can do nothing about because the deployment has no
 * such feature - an unconfigured VAPID identity, most of all.
 *
 * Distinct from `FileHostUnreachableError` because the correct response is
 * different: unreachable is "retry later, the LAN or the process is down",
 * `503 feature_not_configured` is "this server will never answer this, stop
 * asking and fall back". #907's client-only behaviour *is* that fallback,
 * so the distinction is what keeps a missing backend costing the
 * closed-browser case rather than the whole feature.
 */
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
    route: string,
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

/** A LAN service, not a public API over the open internet - long enough
 * that an ordinary slow response never trips it, short enough that a person
 * waiting on a route read gets a terminal outcome in a time nobody would
 * call "hung." Matches `@some-ui/fetch-kit`'s own default (`DEFAULT_OPTIONS.timeout`),
 * which answers U-2 from the route-arrival handoff: the same policy is safe
 * for both. Not exported - nothing outside `resolveTimeoutMs` needs the
 * default directly; a test wanting a different deadline overrides it via
 * `VITE_FILE_HOST_TIMEOUT_MS`, not by importing this value. */
const DEFAULT_FILE_HOST_TIMEOUT_MS = 10_000

/** Read fresh on every call, not cached at transport-creation time - so a
 * test can `vi.stubEnv` a short deadline for the one call it's exercising
 * even though `sessionsRepository` (and therefore this transport) is a
 * module-scope singleton created once. Mirrors `describeFileHost`'s own
 * `import.meta.env` read for the identical reason. */
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
 * Build the default transport for wherever this page is served from.
 *
 * Returns `null` when there is no base URL at all - SSR, or a test with no
 * `window`. Callers treat that as "no backend", which is the same branch
 * the static build takes. Deliberately has no timeout of its own - see this
 * file's header, point 3, and `requestJSON` below, which owns the deadline
 * for the whole request this transport is only the first half of.
 */
export function createFileHostTransport(
  resolution: FileHostResolution = describeFileHost()
): FileHostTransport | null {
  const { baseUrl } = resolution
  if (baseUrl === undefined) return null

  return async (route, init) => {
    const url = `${baseUrl.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`
    try {
      return await fetch(url, {
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
 * Whether `error` is this module's own deadline firing, as opposed to a
 * fast rejection (connection refused, a 5xx) or an unconfigured feature.
 *
 * The distinction matters for retry policy, not just diagnostics: TanStack
 * Query's default `retry: 3` (`providers/tanstack-query.tsx`) is cheap to
 * honor for a fast failure, but multiplies a *timeout* by however many
 * attempts it allows - a black-holed connection has no reason to behave
 * differently on a second attempt, so retrying one just pays the same
 * deadline again for nothing. `providers/tanstack-query.tsx` uses this to
 * make a timeout terminal after one attempt while still retrying every
 * other `file_host` failure.
 */
export function isFileHostTimeout(error: unknown): boolean {
  return (
    error instanceof FileHostUnreachableError &&
    error.cause instanceof DOMException &&
    error.cause.name === "TimeoutError"
  )
}

/**
 * `fetch`, decode, and turn every failure into one of the three errors
 * above - bounded by one deadline covering both halves.
 *
 * Every `file_host` route answers with a JSON body, including the deletes
 * (`{ removed }`, `{ deletedCount }`) - there is no 204 to special-case.
 *
 * The deadline is owned here rather than inside the transport: `transport`
 * only promises headers, and a stalled body after a prompt response would
 * otherwise have no protection at all (see this file's header). Racing the
 * *entire* operation - the transport call, the status check, and the body
 * read, success or error body alike - against one shared abort signal is
 * what closes that gap, whatever step actually stalls.
 */
export async function requestJSON<T>(
  transport: FileHostTransport,
  route: string,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), resolveTimeoutMs())

  const operation = async (): Promise<T> => {
    const response = await transport(route, {
      ...init,
      signal: controller.signal,
    })

    if (response.status === 503) throw new FileHostNotConfiguredError(route)
    if (!response.ok) {
      throw new FileHostResponseError(
        response.status,
        route,
        await errorCodeOf(response)
      )
    }

    // `Response.json()` is `any` by definition — there is no schema to check
    // against here, and the caller's `T` is the claim it is making about the
    // route it asked for. Narrowing happens where the shape is known.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return response.json()
  }

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        // Settles this module's own race the instant the deadline fires,
        // independent of whether `transport`'s own `fetch` honors
        // `controller.signal` - see this file's header, point 3.
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
    // Whichever promise actually won the race above, `controller.signal`
    // having fired *is* this deadline - not whatever specific rejection
    // reason happened to propagate first (see this file's header). Folding
    // both into one canonical, `isFileHostTimeout`-recognizable error keeps
    // the distinction race-condition-free.
    if (controller.signal.aborted) {
      throw new FileHostUnreachableError(
        route,
        new DOMException(
          `file_host did not answer ${route} within the deadline`,
          "TimeoutError"
        )
      )
    }
    throw new FileHostUnreachableError(route, cause)
  } finally {
    clearTimeout(timeoutId)
  }
}
