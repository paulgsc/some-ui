/**
 * Definition 6.1 (Invariant) — canon §6.
 *
 * A predicate the extension exists to maintain. In every case this canon
 * governs, Φ decomposes as a conjunction of local, per-key predicates `phi`,
 * each decidable from a single key's hypothesis entry alone.
 */
export type PerKeyInvariant<K, Attr> = (
  key: K,
  attr: Attr | undefined
) => boolean

export type Invariant<K, Attr> = {
  readonly phi: PerKeyInvariant<K, Attr>
}
