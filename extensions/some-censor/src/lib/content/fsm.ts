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
import type { MusicEvidence, MusicSigns } from "@censor/lib/content/lane/lane"
import { isMusic } from "@censor/lib/content/lane/lane"
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

/** In the listening lane: shown as YouTube shows it, at any age (QD15). */
type Whole = {
  readonly kind: "whole"
  readonly session: SessionId
}

export type ViewState = Absent | Plated | Whole

/** What {@link decide} reads off an observation, and nothing else. */
type Evidence = MusicEvidence & {
  /** Raw vendor date text (`core/observation.ts`). */
  readonly uploadDate: string | null
  /** The card is a Short (QD11: always held). */
  readonly short: boolean
}

/**
 * The view a card's evidence earns at `now`, under the owner's boundary and
 * the music signs their mode reads (#1966).
 *
 * Whole when it is music (`lane/lane.ts`) and its date proves a past upload,
 * neither live nor upcoming, at any age (QD15). Otherwise plated only when
 * the estimator places it at QM3 or QM4. Everything else is absent: no date,
 * a date the grammar cannot read, a live or upcoming card, anything younger
 * than the boundary, and every Short. Missing or invalidated evidence
 * therefore fails closed (doctrine §7), with one exception the owner chose:
 * when `undatedShown` (Music mix, a row of any Mix), a card with no date
 * at all is plated (QD3's amendment).
 */
export function decide(
  evidence: Evidence,
  now: number,
  boundaryDays: number,
  signs: MusicSigns,
  undatedShown: boolean,
  session: SessionId
): ViewState {
  if (evidence.short) return { kind: "absent", session }
  if (undatedShown && evidence.uploadDate === null) {
    return { kind: "plated", session }
  }
  const e = estimate(evidence.uploadDate, now)
  if (e.kind === "aged" && isMusic(evidence, signs)) {
    return { kind: "whole", session }
  }
  const band = classify(e, boundaryDays)
  return band === "QM3" || band === "QM4"
    ? { kind: "plated", session }
    : { kind: "absent", session }
}

/**
 * The `data-boyo` stamp. `styles/content.css` keys `absent` to
 * `display: none`, and `whole` to nothing: the card as YouTube draws it.
 */
type DataBoyo = "absent" | "plated" | "whole"

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
    case "whole": {
      return { dataBoyo: "whole", plate: null }
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
export type WatchView = "pending" | "absent" | "plated" | "whole"

/** A view shown with its player: plated, or whole in the lane. */
export function admitted(view: WatchView | ViewState["kind"]): boolean {
  return view === "plated" || view === "whole"
}

/**
 * {@link decide}'s rule for the page's own video: whole when it is music and
 * the youngest of the dates it shows proves a past upload (QD15); else
 * plated at QM3 or QM4 on that date; absent for a Short, and for a page
 * whose dates the grammar cannot place (QD3). A page with no metadata or no
 * date yet is pending.
 */
export function decideWatch(
  watch: WatchObservation,
  now: number,
  boundaryDays: number,
  signs: MusicSigns
): WatchView {
  if (watch.short) return "absent"
  if (!watch.hydrated || watch.dates.length === 0) return "pending"
  const e = youngest(watch.dates.map((raw) => estimate(raw, now)))
  if (e.kind === "aged" && isMusic(watch, signs)) return "whole"
  const band = classify(e, boundaryDays)
  return band === "QM3" || band === "QM4" ? "plated" : "absent"
}
