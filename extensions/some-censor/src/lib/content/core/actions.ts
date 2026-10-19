/**
 * Everything Core ever asks for (BC3) — Boundary Contract B6: effects are
 * named values, not calls.
 *
 * An action says what should happen; the Actuator is the only thing
 * that makes it happen, and the runtime binds the DOM targets a `key` names
 * before handing one over, so nothing here can name an element either.
 */

import type { RenderModel, ViewState, WatchView } from "@censor/lib/content/fsm"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import type { VideoId } from "@censor/types/ids"

import type { CardKey } from "./keys"
import type { ShapeConfidence } from "./observation"
import type { Rules } from "./state"

export type Action =
  /**
   * Bring every element carrying `key` to `model`. Idempotent by contract:
   * the Actuator compares against what it last realized, so Core may emit
   * this on every observation without cost.
   */
  | {
      readonly kind: "render"
      readonly key: CardKey
      readonly model: RenderModel
    }
  /** Strip everything the extension put on the elements carrying `key`. */
  | { readonly kind: "unmount"; readonly key: CardKey }
  /**
   * Bring the page to the watch view for `videoId`, or, with `view: null`,
   * strip the watch page's hold: no watch page is shown (#1805). In the
   * miniplayer the video is held the same, but "Not here." is not shown
   * over a page that is not its own.
   */
  | {
      readonly kind: "watch"
      readonly view: WatchView | null
      readonly videoId: VideoId | null
      readonly miniplayer: boolean
      /** The plate's tone for the player's poster; null unless plated. */
      readonly poster: string | null
      /** The owner held for the real thumbnail, this view (QD13). */
      readonly face: boolean
      /** The face control the owner's mode offers (#1966). */
      readonly offer: Rules["face"]
    }
  /**
   * Open the card carrying `key`, as a click on it would: autoplay skips
   * to it (#1966).
   */
  | { readonly kind: "play"; readonly key: CardKey }
  /** A fact for the flight recorder; the runtime forwards it. */
  | { readonly kind: "record"; readonly fact: CoreFact }

/**
 * What Core knows happened, for the diagnostics layer (OBS1). One
 * variant per event that layer already records from this pipeline; the
 * runtime maps each onto the corresponding `BoyoObservability` call. Facts
 * about the DOM — churn versus recycle, queue depths, what the occluder is
 * hiding — are the Sensor's to report, not Core's.
 */
export type CoreFact =
  | { readonly kind: "session.start"; readonly session: number }
  | { readonly kind: "session.reset"; readonly session: number }
  | { readonly kind: "navigation" }
  | { readonly kind: "mount.resolved"; readonly videoId: VideoId }
  | { readonly kind: "mount.provisional"; readonly videoId: VideoId }
  | {
      readonly kind: "entry.state"
      readonly videoId: VideoId
      readonly state: ViewState["kind"]
    }
  | { readonly kind: "channel.backfilled"; readonly videoId: VideoId }
  | {
      readonly kind: "shape.unknown"
      readonly tag: string
      readonly surface: BoyoSurface
      readonly reason: UnknownShapeReason
      readonly shape: ShapeConfidence
    }
  // ── Facts the Sensor reports about the DOM (never Core) ───────────────
  | { readonly kind: "mutation.batch"; readonly candidates: number }
  | { readonly kind: "mount.queued"; readonly tag: string }
  | { readonly kind: "mount.rejected"; readonly tag: string }
  /** An id change ruled vendor churn rather than a recycle (#1423). */
  | { readonly kind: "churn.ignored"; readonly videoId: VideoId }
  | { readonly kind: "channel.abandoned"; readonly videoId: VideoId }
  /**
   * A raw date run observed for a card — the QC2 corpus. Emitted at adoption
   * and whenever a later observation supplies a new date (YouTube hydrates the
   * date after the card).
   */
  | {
      readonly kind: "date.observed"
      readonly raw: string | null
      readonly surface: BoyoSurface
      readonly renderer: string
    }
