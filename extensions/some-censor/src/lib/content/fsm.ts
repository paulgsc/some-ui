/**
 * A card's view and its projection (`docs/absent-plated-heard.md`, #1803).
 *
 * A view is decided by evidence, never by a gesture: there is no transition
 * a user can take, so there is no transition table. {@link decide} is the
 * whole machine.
 *
 * Design invariants:
 *
 *   F1 — Every state carries its SessionId. Core mints a view only with the
 *        session it is running under, so a view cannot outlive its session.
 *
 *   F3 — project() has an exhaustive switch over ViewState.kind. Adding a new
 *        variant without updating project() is a compile error.
 *
 * F2 and F4 were the disclosure ladder's typed transitions and its reset;
 * they went with the ladder.
 */

import type { Observation } from "@censor/lib/content/core/observation"
import { classify, estimate } from "@censor/lib/content/maturity/maturity"
import { initial, tone } from "@censor/lib/content/plate/plate"
import type { SessionId } from "@some-extension/common"
import { assertNever } from "@some-extension/common"

/** Not rendered, and not in the accessibility tree (QD11). */
type Absent = {
  readonly kind: "absent"
  readonly session: SessionId
}

/** Old enough to be shown, behind a plate (QD12). */
type Plated = {
  readonly kind: "plated"
  readonly session: SessionId
}

export type ViewState = Absent | Plated

/** What {@link decide} reads off an observation, and nothing else. */
type Evidence = {
  /** Raw vendor date text (`core/observation.ts`). */
  readonly uploadDate: string | null
  /** The card is a Short (QD11: always held). */
  readonly short: boolean
}

/**
 * The view a card's evidence earns at `now`, under the owner's boundary.
 *
 * Plated only when the estimator places it at QM3 or QM4. Everything else is
 * absent: no date, a date the grammar cannot read, a live or upcoming card,
 * anything younger than the boundary, and every Short. Missing or
 * invalidated evidence therefore fails closed (doctrine §7).
 */
export function decide(
  evidence: Evidence,
  now: number,
  boundaryDays: number,
  session: SessionId
): ViewState {
  if (evidence.short) return { kind: "absent", session }
  const band = classify(estimate(evidence.uploadDate, now), boundaryDays)
  return band === "QM3" || band === "QM4"
    ? { kind: "plated", session }
    : { kind: "absent", session }
}

/** The `data-boyo` stamp. `styles/content.css` keys `absent` to `display: none`. */
type DataBoyo = "absent" | "plated"

/**
 * The plate's values (QD12), which `styles/content.css` paints over a plated
 * card's thumbnail and channel photo: CSS colours and the disc's letter.
 */
export type Plate = {
  readonly fill: string
  readonly disc: string
  readonly initial: string
}

export type RenderModel = {
  readonly dataBoyo: DataBoyo
  /** Null on an absent card, which is not rendered at all. */
  readonly plate: Plate | null
}

/** What a plate is made from: ids and the channel's display name. */
type PlateInputs = Pick<Observation, "videoId" | "channelId" | "channelName">

export function project(state: ViewState, inputs: PlateInputs): RenderModel {
  const { kind } = state
  switch (kind) {
    case "absent": {
      return { dataBoyo: "absent", plate: null }
    }
    case "plated": {
      const { videoId, channelId, channelName } = inputs
      return {
        dataBoyo: "plated",
        plate: {
          fill: tone(videoId),
          // Before its channel resolves a card's disc is toned by name.
          disc: tone(channelId ?? channelName ?? videoId),
          initial: initial(channelName),
        },
      }
    }
    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}
