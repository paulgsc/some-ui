/**
 * Definition 4.1 (Identity resolution), Proposition 4.1 (Identity
 * non-permanence), Corollary 4.1.1 (continuity check) — canon §4.
 *
 * Even when a token is delivered, the observer must determine which
 * logical key it is evidence *for* — a distinct problem from ordering
 * evidence about an already-known key (§5, S6). `ξ` is applied fresh at
 * every ingestion, never cached across rounds without re-validation
 * (Definition 4.1), and every ingestion re-derives it and compares against
 * the key previously associated with the same physical carrier
 * (Corollary 4.1.1) — a mismatch is an *implicit deletion*: Axiom 3.4
 * guarantees no explicit removal token will ever announce it.
 */

export type ExtractionTier = "raw" | "partial" | "full"

const TIER_RANK: Readonly<Record<ExtractionTier, number>> = {
  raw: 0,
  partial: 1,
  full: 2,
}

/** Total order `raw ≺ partial ≺ full` (Definition 4.1), exposed for the Estimator's per-key order (S6, Definition 5.2). */
export function compareTiers(a: ExtractionTier, b: ExtractionTier): number {
  return TIER_RANK[a] - TIER_RANK[b]
}

export type ExtractionResult<K, Attr> =
  | { readonly tier: "raw" }
  | { readonly tier: "partial"; readonly key: K }
  | { readonly tier: "full"; readonly key: K; readonly attrs: Readonly<Attr> }

/**
 * `ξ: Node × Attr -> {("full", k, a), ("partial", k), ("raw")}` (Definition
 * 4.1). Necessarily domain-specific (e.g. "read a video ID"), so it is
 * injected — never hard-coded here.
 */
export type Extractor<Carrier, K, Attr> = (
  carrier: Carrier,
  observed: Readonly<Attr>
) => ExtractionResult<K, Attr>

export type ImplicitDeletion<Carrier, K> = {
  readonly carrier: Carrier
  readonly staleKey: K
}

export type ContinuityCheck<Carrier, K> = {
  /**
   * Compares `key` (the freshly extracted key for `carrier`, or `undefined`
   * if extraction did not reach at least "partial") against whatever key
   * was previously recorded for the same carrier. Returns an implicit
   * deletion when they differ. Absence of a fresh key (Axiom 3.4) is never
   * itself read as deletion — only a genuine mismatch between two known
   * keys is (Proposition 4.1's recycling case).
   */
  observe(
    carrier: Carrier,
    key: K | undefined
  ): ImplicitDeletion<Carrier, K> | undefined
  /** Drops bookkeeping for a carrier the caller knows is gone for good (e.g. GC'd). */
  forget(carrier: Carrier): void
}

export function createContinuityCheck<Carrier, K>(): ContinuityCheck<
  Carrier,
  K
> {
  const previouslySeen = new Map<Carrier, K>()

  return {
    observe(carrier, key): ImplicitDeletion<Carrier, K> | undefined {
      if (key === undefined) {
        return undefined
      }
      const previous = previouslySeen.get(carrier)
      previouslySeen.set(carrier, key)
      if (previous !== undefined && previous !== key) {
        return { carrier, staleKey: previous }
      }
      return undefined
    },
    forget(carrier): void {
      previouslySeen.delete(carrier)
    },
  }
}

export type IdentifyResult<Carrier, K, Attr> = {
  readonly extraction: ExtractionResult<K, Attr>
  readonly implicitDeletion?: ImplicitDeletion<Carrier, K>
}

/**
 * Runs `ξ` fresh against `carrier`/`observed`, then the continuity check —
 * unconditionally, on every call, regardless of whether extraction reached
 * "partial" or "full" (Corollary 4.1.1's requirement: the check runs on
 * *every* ingestion, not just a subset of code paths).
 */
export function identify<Carrier, K, Attr>(
  carrier: Carrier,
  observed: Readonly<Attr>,
  extractor: Extractor<Carrier, K, Attr>,
  continuity: ContinuityCheck<Carrier, K>
): IdentifyResult<Carrier, K, Attr> {
  const extraction = extractor(carrier, observed)
  const key = extraction.tier === "raw" ? undefined : extraction.key
  const implicitDeletion = continuity.observe(carrier, key)
  return implicitDeletion === undefined
    ? { extraction }
    : { extraction, implicitDeletion }
}
