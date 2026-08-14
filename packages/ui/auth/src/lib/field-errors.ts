import type { ZodError } from "zod"

/**
 * Per-field messages keyed by field name.
 *
 * A `Map` rather than a `Record`, because reading a `Record` back out means
 * `errors[name]` — a computed member expression, which this repo's ESLint
 * config forbids outright (`no-restricted-syntax`). `errors.get(name)` is the
 * same lookup with an honest `string | undefined` result.
 */
export type FieldErrors = ReadonlyMap<string, string>

/** Shared empty map, so "no errors" is a stable identity across renders. */
export const EMPTY_FIELD_ERRORS: FieldErrors = new Map<string, string>()

/**
 * Collapses a `ZodError` to one message per field — the first one raised.
 *
 * Showing every failed check at once ("too short", "needs a digit", "needs a
 * symbol") is noise; the user fixes one thing and resubmits either way.
 * Issues whose path is empty (a whole-object `.refine`) or non-string (an
 * array index) have no field to attach to and are dropped, so a form-level
 * check must name its field via `path: ["confirmPassword"]`.
 */
export const toFieldErrors = (error: ZodError): FieldErrors => {
  const errors = new Map<string, string>()

  for (const issue of error.issues) {
    const field = issue.path.at(0)
    if (typeof field !== "string") continue
    if (errors.has(field)) continue
    errors.set(field, issue.message)
  }

  return errors
}
