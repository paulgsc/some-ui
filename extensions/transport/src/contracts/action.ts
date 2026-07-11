/**
 * The action alphabet `A` (canon §7, Definition D.3) — the vocabulary the
 * Actuator already knows how to realize. Transport does not know what an
 * action *means*; it only knows an action is realizable against `G_t` and
 * (per Definition 7.3) self-taggable. `kind` is a discriminant an Actuator
 * implementation switches on; everything domain-specific lives on a
 * consumer's own subtype, never on this base shape.
 */
export type Action = {
  readonly kind: string
}
