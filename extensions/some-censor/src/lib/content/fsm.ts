/**
 * A card's view and its projection (`docs/absent-plated-heard.md`, #1803),
 * and the watch page's view (#1805).
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

import type { WatchObservation } from "@censor/lib/content/core/observation"
import {
  classify,
  estimate,
  youngest,
} from "@censor/lib/content/maturity/maturity"
import type { Plate } from "@censor/lib/content/plate/plate"
import { plateOf } from "@censor/lib/content/plate/plate"
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

export type RenderModel = {
  readonly dataBoyo: DataBoyo
  /** Null on an absent card, which is not rendered at all. */
  readonly plate: Plate | null
}

export function project(
  state: ViewState,
  inputs: Parameters<typeof plateOf>[0]
): RenderModel {
  const { kind } = state
  switch (kind) {
    case "absent": {
      return { dataBoyo: "absent", plate: null }
    }
    case "plated": {
      return { dataBoyo: "plated", plate: plateOf(inputs) }
    }
    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}

/**
 * The page's own video (#1805). `pending` until the page's metadata names
 * it: the player and what is said about the video stay hidden, and so does
 * the tab title, without yet saying "Not here." (QD17).
 */
export type WatchView = "pending" | "absent" | "plated"

/**
 * {@link decide}'s rule for the page's own video: plated at QM3 or QM4, on
 * the youngest of the dates it shows; absent for a Short, and for a
 * hydrated page with no date the grammar can place (QD3).
 */
export function decideWatch(
  watch: WatchObservation,
  now: number,
  boundaryDays: number
): WatchView {
  if (watch.short) return "absent"
  if (!watch.hydrated) return "pending"
  const e = youngest(watch.dates.map((raw) => estimate(raw, now)))
  const band = classify(e, boundaryDays)
  return band === "QM3" || band === "QM4" ? "plated" : "absent"
}
