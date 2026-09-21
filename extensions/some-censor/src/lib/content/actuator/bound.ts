/**
 * What the Actuator is handed (BC4, #1437): Core's actions, with the
 * elements a key names bound on by the runtime.
 *
 * Core cannot name an element (Boundary Contract B2), and the Actuator may
 * read nothing but its own input (§3's ownership table) — so the join
 * between a `CardKey` and the elements currently carrying it happens in the
 * runtime, which asks the Sensor and hands the Actuator a `BoundAction`.
 * The Actuator never looks anything up.
 */

import type { Action } from "@censor/lib/content/core/actions"

/** How one element takes part in a card. */
export type CustodyRole =
  /** Carries the veil, the `data-boyo-vid` stamp and the click target. */
  | "anchor"
  /**
   * Inside an anchor and matching a pre-mask rule of its own (#1426's grid
   * cell around a lockup is the reverse: there the *inner* is the anchor).
   * Gets `data-boyo` so the occluder releases it, nothing else — D6.
   */
  | "nested"

export type CustodyTarget = {
  readonly el: HTMLElement
  readonly role: CustodyRole
}

/** A `render` or `unmount`, with its targets. */
export type BoundCardAction = {
  readonly action: Extract<Action, { kind: "render" | "unmount" }>
  readonly targets: ReadonlyArray<CustodyTarget>
}

/** Every other action carries everything it needs already. */
export type BoundOtherAction = {
  readonly action: Exclude<Action, { kind: "render" | "unmount" }>
}

export type BoundAction = BoundCardAction | BoundOtherAction
