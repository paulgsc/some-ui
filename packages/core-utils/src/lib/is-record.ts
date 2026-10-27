/**
 * `value` is a plain object you can read fields from: not null, not an array.
 *
 * The first narrowing step at an `unknown` boundary (a parsed body, a stored value);
 * per-field checks follow at the call site.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
