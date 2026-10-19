/**
 * Everything Core is ever told (BC3).
 *
 * Two families, kept apart because the Boundary Contract's B5 is about the
 * first: the only *vendor* events Core sees are mutation (as the tokens the
 * Sensor derives from it) and navigation. The second family is the
 * extension's own world, which is now only the shell's lifecycle.
 *
 * Every event carries `t`, the shell's clock at the moment it happened.
 * Core has no clock of its own (B8): "how long has this been pending" is
 * answered by the shell comparing two `t`s it supplied, never by Core
 * reading one.
 */

import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import type { VideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"

import type { CardKey } from "./keys"
import type { Observation, WatchObservation } from "./observation"
import type { Rules } from "./state"

// ── Tokens: what the Sensor derives from the vendor (B5) ─────────────────────

export type Token =
  /**
   * A navigation finished. The shell mints the new session so Core never
   * has to (a counter is hidden state, and B8 forbids it); every card of the
   * previous session is unmounted and forgotten, which is C2's "full
   * teardown on navigation" as a value rather than a call.
   */
  | { readonly kind: "nav"; readonly session: SessionId; readonly t: number }
  /**
   * A card is on the page with these attributes. Re-sent on every
   * re-observation of the same key; Core folds the observation and
   * re-renders, and the Actuator's idempotence makes the repeat free.
   */
  | {
      readonly kind: "observed"
      readonly key: CardKey
      readonly observation: Observation
      readonly t: number
    }
  /** No element carries this key any more. */
  | { readonly kind: "gone"; readonly key: CardKey; readonly t: number }
  /**
   * The watch page's description was drawn again, or lost the face
   * control, with no change in the reading: render the watch view again,
   * on the description as it is now (QD13).
   */
  | { readonly kind: "described"; readonly t: number }
  /**
   * The page's own video, as the watch page or a Short shows it, or null
   * when neither is shown (#1805). Re-sent whenever the reading changes.
   */
  | {
      readonly kind: "watched"
      readonly watch: WatchObservation | null
      readonly t: number
    }
  /**
   * A catalogue element the layout table could not place and that carried no
   * extractable card either (B4). Nothing to adopt; counted so the table's
   * staleness is a number, not a support report.
   */
  | {
      readonly kind: "unknown-shape"
      readonly tag: string
      readonly surface: BoyoSurface
      readonly reason: UnknownShapeReason
      readonly t: number
    }

// ── Inputs: the extension's own world ────────────────────────────────────────

/**
 * The shell's lifecycle, the owner's boundary and mode, and the face hold.
 * No gesture on a card reaches Core: a card's view is decided by its
 * evidence under the boundary and the mode (`fsm.ts`, `QD16`). The face hold decides nothing about whether a
 * video is admitted; it shows a plated video's own thumbnail (QD13).
 */
export type Input =
  /** The shell started a session (bootstrap, or re-enable). */
  | {
      readonly kind: "start"
      readonly session: SessionId
      readonly boundaryDays: number
      readonly rules: Rules
      readonly t: number
    }
  /** The shell is tearing the runtime down (disable). */
  | { readonly kind: "stop"; readonly t: number }
  /** The owner set the boundary in the popup (#1807). */
  | { readonly kind: "boundary"; readonly days: number; readonly t: number }
  /** The owner chose a mode (#1966). */
  | { readonly kind: "rules"; readonly rules: Rules; readonly t: number }
  /**
   * The owner held the face control on `videoId`'s plated page for its
   * whole time (QD13, #1805).
   */
  | { readonly kind: "face"; readonly videoId: VideoId; readonly t: number }

export type CoreEvent = Token | Input
