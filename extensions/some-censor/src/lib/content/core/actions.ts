/**
 * Everything Core ever asks for (BC3, #1436) — Boundary Contract B6: effects
 * are named values, not calls.
 *
 * An action says what should happen; the Actuator (#1437) is the only thing
 * that makes it happen, and the runtime binds the DOM targets a `key` names
 * before handing one over, so nothing here can name an element either.
 */

import type { RenderModel, ViewState } from "@censor/lib/content/fsm"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import type { ChannelId, VideoId } from "@censor/types/ids"

import type { CardKey } from "./keys"
import type { ShapeConfidence } from "./observation"

/** How long a whitelisted card shows its tint before revealing itself. */
export const WHITELIST_REVEAL_DELAY_MS = 1800

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
   * Ask the background whether `channelId` is whitelisted; answer as an
   * Input, echoing `generation` so the answer lands on the incarnation that
   * asked and on no later one.
   */
  | {
      readonly kind: "query-whitelist"
      readonly key: CardKey
      readonly generation: number
      /** The lookup's ordinal within the incarnation; echoed by the answer. */
      readonly query: number
      readonly channelId: ChannelId
    }
  /** Persist a whitelist entry in the background. */
  | {
      readonly kind: "persist-whitelist"
      readonly channelId: ChannelId
      readonly channelName: string
    }
  /** Run the optional title-transform hook; answer as an Input. */
  | {
      readonly kind: "transform-title"
      readonly key: CardKey
      readonly generation: number
      readonly version: number
      readonly text: string
      readonly channelId: ChannelId | null
    }
  /** Fire a `timer` Input after `delayMs`, carrying `generation` and `version` back. */
  | {
      readonly kind: "schedule"
      readonly key: CardKey
      readonly generation: number
      readonly version: number
      readonly delayMs: number
    }
  /** A fact for the flight recorder; the runtime forwards it. */
  | { readonly kind: "record"; readonly fact: CoreFact }

/**
 * What Core knows happened, for the diagnostics layer (OBS1, #1395). One
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
  /** A whitelist answer or a title transform arrived for a superseded version. */
  | { readonly kind: "stale.discarded"; readonly videoId: VideoId }
  | {
      readonly kind: "bulk.advance"
      readonly advanced: number
      readonly alreadyPast: number
      readonly channelPending: number
    }
  | {
      readonly kind: "shape.unknown"
      readonly tag: string
      readonly surface: BoyoSurface
      readonly reason: UnknownShapeReason | "degraded"
      readonly shape: ShapeConfidence
    }
  /**
   * A raw date run observed for a card — the QC2 corpus (#1395). Emitted at
   * adoption and again whenever a later observation supplies a date the card
   * did not have (bot-found, #1506's own review: YouTube hydrates the date
   * after the card, so the first observation alone would miss most forms).
   */
  | {
      readonly kind: "date.observed"
      readonly raw: string | null
      readonly surface: BoyoSurface
      readonly renderer: string
    }
