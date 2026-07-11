/**
 * Definition 5.1 (Hypothesis) — canon §5.
 *
 * The estimator's internal state: the observer's current best explanation of
 * a key's properties, restricted to keys it has ever received evidence for.
 * Absence of an entry denotes ⊥ ("no evidence yet") — never "safe" (Axiom
 * C.1's pessimistic default is the caller's responsibility, not this type's).
 */
export type Hypothesis<K, Attr> = {
  get(key: K): Attr | undefined
  has(key: K): boolean
  keys(): Iterable<K>
}
