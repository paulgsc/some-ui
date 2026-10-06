/**
 * What more than one device-backend handler needs: the one subject, the
 * timestamp formats `file_host` writes, and content hashing.
 */

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

/** Lowercase hex SHA-256 of `text`'s UTF-8 bytes - `file_host`'s content hash. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
