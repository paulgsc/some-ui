/**
 * Extracted — output contract of the extract layer.
 *
 * Invariants enforced here:
 *
 *   E1 — Partiality is explicit in the type, not in runtime null-checks scattered
 *        across callers.  The discriminant `kind` is the single authoritative signal.
 *
 *   E2 — FullyExtracted is the ONLY input accepted by resolve().  The compiler
 *        rejects RawExtracted at the resolve boundary, making it impossible to
 *        call resolve() on an unhydrated element.
 *
 *   E3 — Fields inside FullyExtracted are `string`, not `string | null`.
 *        The narrowing from null to non-null happens exactly once, in tryExtract,
 *        and is never re-checked downstream.
 */

export type RawExtracted = {
  readonly kind: "raw"
  readonly videoId: string | null
  readonly channelId: string | null
}

export type FullyExtracted = {
  readonly kind: "full"
  readonly videoId: string // guaranteed non-null by construction
  readonly channelId: string // guaranteed non-null by construction
}

export type Extracted = RawExtracted | FullyExtracted

/** Narrowing predicate — usable as a type guard in filter chains. */
export function isFullyExtracted(x: Extracted): x is FullyExtracted {
  return x.kind === "full"
}
