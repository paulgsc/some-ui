/**
 * What an app's record shares when it is kept on the paired home server
 * (paulgsc/server `file_host`): the request port it sends through, how one
 * exchange ends, and reading home's answers. aph (`@some-ui/aph`) and the
 * phone's Jobs record (apps/www `lib/jobs/home`) each run their own exchange
 * over these.
 */

/** What home answered: its status, and its body as text. */
export type HomeAnswer = { status: number; body: string; etag?: string }

/**
 * A body that is not JSON: its media type, and its bytes as base64, the way
 * the phone's native request carries bytes (a voice note's audio).
 */
export type HomeBytes = {
  readonly contentType: string
  readonly base64: string
}

/** `body` is bytes with a media type, not JSON text. */
export function isHomeBytes(body: unknown): body is HomeBytes {
  return (
    typeof body === "object" &&
    body !== null &&
    "contentType" in body &&
    "base64" in body &&
    typeof body.contentType === "string" &&
    typeof body.base64 === "string"
  )
}

/**
 * A credentialed request to the paired home, at `path` under its API base,
 * with `body` sent as these bytes: JSON text, or `HomeBytes`. The one request
 * port every exchange with home sends through.
 */
export type HomeCall = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: string | HomeBytes
) => Promise<HomeAnswer>

/** How an exchange that got its answers ended. */
export type HomeExchanged =
  /** Everything sendable sent, and home's record read. */
  | { readonly kind: "synced" }
  /** Home answered `401`: it no longer knows this phone. */
  | { readonly kind: "forgotten" }
  /**
   * Home answered something else, or the exchange failed on the phone
   * itself (`why: "fault"`), said in words.
   */
  | { readonly kind: "failed"; readonly why: string }

/** A schema's `safeParse`, as zod's has it. */
type Parser<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false }
}

/** `text` as `schema` reads it, or null. */
export function readAs<T>(schema: Parser<T>, text: string): T | null {
  try {
    const read = schema.safeParse(JSON.parse(text))
    return read.success ? read.data : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A `422`'s reasons (`error.details`), as "field why; field why". */
export function refusalOf(body: string): string {
  let details: unknown
  try {
    const parsed: unknown = JSON.parse(body)
    details =
      isRecord(parsed) && isRecord(parsed.error) ? parsed.error.details : null
  } catch {
    details = null
  }
  const reasons = isRecord(details)
    ? Object.entries(details).flatMap(([field, whys]) =>
        Array.isArray(whys)
          ? whys
              .filter((why) => typeof why === "string")
              .map((why) => `${field} ${why}`)
          : []
      )
    : []
  return reasons.length > 0 ? reasons.join("; ") : "refused"
}

/** An answer an exchange did not expect, said in words. */
export function unexpectedAnswer(what: string, status: number): HomeExchanged {
  return { kind: "failed", why: `${what}: home answered ${status}` }
}

/**
 * Home refused a write because this phone's person stopped sending it, as
 * home heard (paulgsc/server#433's `409`, code `sharing_stopped`): not a
 * refusal of what was sent.
 */
export function stoppedOnHome(answer: HomeAnswer): boolean {
  if (answer.status !== 409) return false
  try {
    const parsed: unknown = JSON.parse(answer.body)
    const error: unknown =
      typeof parsed === "object" && parsed !== null
        ? Reflect.get(parsed, "error")
        : null
    return (
      typeof error === "object" &&
      error !== null &&
      Reflect.get(error, "code") === "sharing_stopped"
    )
  } catch {
    return false
  }
}
