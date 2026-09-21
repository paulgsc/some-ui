/**
 * Everything Core is ever told (BC3, #1436).
 *
 * Two families, kept apart because the Boundary Contract's B5 is about the
 * first: the only *vendor* events Core sees are mutation (as the tokens the
 * Sensor derives from it) and navigation. The second family is the
 * extension's own world — the user's gestures, the background's answers,
 * the shell's lifecycle and timers — which is exogenous too, but not the
 * vendor's, and is enumerated here rather than smuggled in as calls.
 *
 * Every event carries `t`, the shell's clock at the moment it happened.
 * Core has no clock of its own (B8): "how long has this been pending" is
 * answered by the shell comparing two `t`s it supplied, never by Core
 * reading one.
 */

import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import type { ChannelId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"

import type { CardKey } from "./keys"
import type { Observation } from "./observation"

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

export type Gesture = "click" | "dblclick"

export type CensorCommand = "advance-all-to-title"

export type Input =
  /** The shell started a session (bootstrap, or re-enable). */
  | { readonly kind: "start"; readonly session: SessionId; readonly t: number }
  /** The shell is tearing the runtime down (disable). */
  | { readonly kind: "stop"; readonly t: number }
  /** A veil received a committed single or double click. */
  | {
      readonly kind: "gesture"
      readonly key: CardKey
      readonly gesture: Gesture
      readonly t: number
    }
  /** The user asked, via the context menu, to whitelist this card's channel. */
  | {
      readonly kind: "whitelist-request"
      readonly key: CardKey
      readonly t: number
    }
  /**
   * The background answered a `query-whitelist` action. `generation` is the
   * one the action carried: an answer for a previous incarnation of the key
   * is stale, whatever its channel says.
   */
  | {
      readonly kind: "whitelist-answer"
      readonly key: CardKey
      readonly generation: number
      readonly query: number
      readonly channelId: ChannelId
      readonly whitelisted: boolean
      readonly t: number
    }
  /** The background broadcast that a channel was whitelisted (any tab). */
  | {
      readonly kind: "whitelist-broadcast"
      readonly channelId: ChannelId
      readonly t: number
    }
  /**
   * The title-transform hook answered a `transform-title` action.
   * `translated` says whether `text` is the hook's output or the original
   * handed back untouched (the hook absent, throwing, or returning a
   * non-string — `maybeTransformTitle`'s fallback). Bot-found (#1506's own
   * review): without it every answer read as a translation, styled and
   * labelled as one.
   */
  | {
      readonly kind: "title-transformed"
      readonly key: CardKey
      readonly generation: number
      readonly version: number
      readonly text: string
      readonly translated: boolean
      readonly t: number
    }
  /** A `schedule` action's timer fired. */
  | {
      readonly kind: "timer"
      readonly key: CardKey
      readonly generation: number
      readonly version: number
      readonly t: number
    }
  /** A keybinding command. */
  | {
      readonly kind: "command"
      readonly command: CensorCommand
      readonly t: number
    }

export type CoreEvent = Token | Input
