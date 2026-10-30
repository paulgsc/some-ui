/**
 * What the Actuator is handed (BC4): Core's actions, with the
 * elements a key names bound on by the runtime.
 *
 * Core cannot name an element (Boundary Contract B2), and the Actuator may
 * read nothing but its own input (§3's ownership table) — so the join
 * between a `CardKey` and the elements currently carrying it happens in the
 * runtime, which asks the Sensor and hands the Actuator a `BoundAction`.
 * The Actuator never looks a card up. Besides the watch link of a `play`'s
 * one target, the Up next card to open, its only read of the page is the
 * watch page's hold (`watch-hold.ts`), which reads only to keep its own
 * writes held and decides nothing.
 */

import type { Action } from "@censor/lib/content/core/actions"
import type { RowMark } from "@censor/lib/content/course/course"

/** How one element takes part in a card. */
export type CustodyRole =
  /** Carries the plate's values and the `data-boyo-vid` stamp. */
  | "anchor"
  /**
   * Inside an anchor and matching a pre-mask rule of its own (a grid cell
   * around a lockup is the reverse: there the *inner* is the anchor).
   * Gets `data-boyo` so the occluder releases it, nothing else — D6.
   */
  | "nested"

export type CustodyTarget = {
  readonly el: HTMLElement
  readonly role: CustodyRole
}

/**
 * A `render`, `unmount`, `play` or `watch`, with its targets: the only
 * actions the Actuator receives, since the runtime forwards `record` facts
 * itself. A `watch` names no card; its one target, when the Sensor has
 * one, is the shown watch page's description, where the face control goes.
 */
export type BoundAction = {
  readonly action: Extract<
    Action,
    { kind: "render" | "unmount" | "play" | "watch" }
  >
  readonly targets: ReadonlyArray<CustodyTarget>
}

/**
 * One row of the watch page's playlist and its mark (R12), bound by the
 * runtime from a `course` action: every playlist on the page whose rows
 * are the action's, row by row. Null takes the row's mark away.
 */
export type MarkedRow = {
  readonly el: HTMLElement
  readonly mark: RowMark | null
}
