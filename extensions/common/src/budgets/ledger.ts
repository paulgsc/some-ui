/**
 * The shape of an extension's effect ledger. The *data* is per-extension and
 * lives in that extension's own tree; only the vocabulary lives here.
 *
 * Splitting it this way is the point of the package boundary. Every
 * extension in this workspace injects into pages it does not control, so
 * every extension needs the same admission rule; but what each one declares
 * — which primitives it uses, at what cost, owned by which module — is
 * irreducibly its own. A shared rule with per-extension declarations is the
 * only split that lets the rule be checked without it knowing anything
 * about any particular extension.
 */

import type { CostClass, RetentionClass } from "./effect-alphabet"

export type LedgerEntry = {
  /** Exact number of occurrences expected in this bundle. */
  readonly count: number
  readonly cost: CostClass
  readonly retention: RetentionClass
  /**
   * Source modules responsible, for review. Not machine-checked — the
   * shipped bundle is mangled, so there is no reliable mapping back to a
   * source file. This field exists so a human reviewing a ledger diff knows
   * where to look, not so a tool can verify it.
   */
  readonly owner: string
  /** Why this class holds, in terms of S_i (nodes), H_i (depth), A_i (arrivals). */
  readonly note: string
}

/** bundle filename → effect name → declaration. */
export type EffectLedger = ReadonlyMap<string, ReadonlyMap<string, LedgerEntry>>
