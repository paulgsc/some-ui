/**
 * What more than one device-backend handler needs: the one subject, the
 * timestamp formats `file_host` writes, and content hashing.
 */
import { isRecord } from "@some-ui/core-utils"

/** `file_host`'s content hash. */
export { sha256Hex } from "@some-ui/core-utils"

/**
 * The phone's one person: a fixed id (the server mints `subject-<32 hex>`
 * per account), distinct from the server's legacy `subject-local`.
 */
export const DEVICE_SUBJECT = "subject-device"

/**
 * chrono's `Utc::now().to_rfc3339()`, as `file_host` stores timestamps:
 * `+00:00`, not `Z`, at millisecond precision.
 */
export function rfc3339(ms: number): string {
  return new Date(ms).toISOString().replace(/Z$/, "+00:00")
}

/** `to_rfc3339_opts(Millis, true)`: the shelf's `savedAt`, `Z` form. */
export function rfc3339Millis(ms: number): string {
  return new Date(ms).toISOString()
}

/** `field` of the JSON object in `body`, when it is a string; else `null`. */
export function stringFieldOf(body: string, field: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body)
    const found = isRecord(parsed) ? parsed[field] : undefined
    return typeof found === "string" ? found : null
  } catch {
    return null
  }
}

/** Each value's string `field`, skipping a value without one. */
export function stringsAt(
  values: ReadonlyArray<unknown>,
  field: string
): Array<string> {
  return values.flatMap((value) => {
    const found = isRecord(value) ? value[field] : undefined
    return typeof found === "string" ? [found] : []
  })
}
