/**
 * The grammar-lens session: a pure reducer over a set of lens items
 * (adaptive-learning canon Cor. 4.8, Rem. 4.15, Rem. 4.10).
 *
 * Like the read-aloud set machine it owns no clock and no speech: it returns
 * effects and takes back what happened as events tagged with their time, and
 * a wait carries the sequence number of the screen that asked for it, so a
 * stale timer changes nothing.
 *
 * - An item waits for its answer. Right or wrong is shown at once; after a
 *   miss the step-down asks its questions first, and the item's reveal waits
 *   until it ends (Rem. 4.15).
 * - The step-down stops at its first right answer, when it runs out, when
 *   it is skipped, or when its two minutes do. Nothing marks its answers; it
 *   only moves on.
 * - After alternate right answers, the reveal offers the situation check;
 *   its choice changes nothing and may be changed.
 * - Every screen ends within two minutes (Rem. 4.10): an item unanswered by
 *   then expires, the step-down closes, the reveal moves on, and the summary
 *   ends the session. A hidden page, or the host's session paused, pauses
 *   the screen. A hidden page's pause shows nothing, so it waits; a pause on
 *   screen is a screen like any other and, left two minutes, ends the
 *   sitting. When neither holds, the screen gets its two minutes again.
 * - After thirty minutes nothing new begins, neither an item nor a summary,
 *   and a pause ends the sitting: the rest waits for `start-sitting`. An
 *   answered item's step-down or reveal resumes with the next sitting; an
 *   item not yet answered begins again.
 */

import { assertNever } from "@some-ui/core-utils"
import type {
  LensAnswer,
  LensItem,
} from "@topik/lib/topik/read-aloud/lens/items"
import {
  graded,
  probeRight,
  shownMistakes,
} from "@topik/lib/topik/read-aloud/lens/items"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { MAX_SCREEN_MS, SITTING_MS } from "@topik/lib/topik/read-aloud/timing"

/** The screens a pause can interrupt, and resumes. */
type PausablePhase =
  | { name: "item" }
  | { name: "step-down"; step: number }
  | { name: "reveal" }
  | { name: "summary" }

export type LensPhase =
  | { name: "idle" }
  | PausablePhase
  | {
      name: "paused"
      /** "session": the host's session is paused, with the page shown. */
      by: "hidden" | "session"
      resume: PausablePhase
      /** When the pause began. */
      since: number
    }
  | {
      name: "sitting-over"
      /** An answered item's step-down or reveal, which the next sitting resumes. */
      resume: FollowUp | null
    }

export type StepDownEnd = "right" | "ran-out" | "skipped" | "expired"

/** What one item came to; the step-down's answers are kept, never shown. */
export type LensOutcome = {
  /** Null while unanswered, and for an item that expired. */
  answer: LensAnswer | null
  right: boolean
  expired: boolean
  chosen: MistakeId | null
  probes: Array<{ rung: number; answer: string; right: boolean }>
  /** Time the item spent paused before it was answered. */
  pausedMs: number
  /** Null when no step-down was asked. */
  stepDown: StepDownEnd | null
  /** The rung it stopped on rightly; 0 when it ran out; else null. */
  floor: number | null
  /** Offered on alternate right answers; the index chosen, if any. */
  situation: { chosen: number | null } | null
  /** When the item appeared, and when it was answered or expired. */
  shownAt: number
  answeredAt: number | null
}

export type LensState = {
  seq: number
  phase: LensPhase
  items: Array<LensItem>
  cursor: number
  outcomes: Array<LensOutcome>
  /** Right answers this session, which time the situation check. */
  rights: number
  sittingStartedAt: number | null
}

export type LensEffect =
  /** Dispatch `elapsed` with this `seq` after `ms`, cancelling any other wait. */
  | { type: "wait"; seq: number; ms: number }
  /** Say the item's cue: it was drawn to be heard. */
  | { type: "speak-cue"; text: string }
  /** The item at `index` is done with: its outcome is final. */
  | { type: "closed"; index: number; at: number }
  | { type: "stop-speech" }
  /** Build the next set and dispatch `begin`. */
  | { type: "request-set" }
  /** The summary ran out its two minutes: the session ends. */
  | { type: "exit" }

export type LensEvent =
  | { type: "begin"; at: number; items: Array<LensItem> }
  | { type: "answer"; at: number; answer: LensAnswer }
  | { type: "probe"; at: number; answer: string }
  | { type: "skip-probes"; at: number }
  | { type: "situation"; at: number; chosen: number }
  | { type: "next"; at: number }
  | { type: "next-set"; at: number }
  | { type: "elapsed"; at: number; seq: number }
  | { type: "hidden"; at: number }
  /** The host's session paused, the page shown; `shown` when neither. */
  | { type: "held"; at: number }
  | { type: "shown"; at: number }
  | { type: "start-sitting"; at: number }

export type LensTransition = { state: LensState; effects: Array<LensEffect> }

/** A learner's event, before it is dated. */
export type LensTap = LensEvent extends infer E
  ? E extends LensEvent
    ? Omit<E, "at">
    : never
  : never

export const createLensMachine = (): LensState => ({
  seq: 0,
  phase: { name: "idle" },
  items: [],
  cursor: 0,
  outcomes: [],
  rights: 0,
  sittingStartedAt: null,
})

export const currentItem = (state: LensState): LensItem | undefined =>
  state.items[state.cursor]

export const currentOutcome = (state: LensState): LensOutcome | undefined =>
  state.outcomes[state.cursor]

const OPEN: LensOutcome = {
  answer: null,
  right: false,
  expired: false,
  chosen: null,
  probes: [],
  stepDown: null,
  floor: null,
  situation: null,
  shownAt: 0,
  answeredAt: null,
  pausedMs: 0,
}

/** Move to a screen under a fresh sequence number, with its two minutes. */
function enter(
  state: LensState,
  phase: LensPhase,
  effects: Array<LensEffect> = []
): LensTransition {
  const seq = state.seq + 1
  return {
    state: { ...state, seq, phase },
    effects: [...effects, { type: "wait", seq, ms: MAX_SCREEN_MS }],
  }
}

const sittingOver = (state: LensState, at: number): boolean =>
  state.sittingStartedAt !== null && at - state.sittingStartedAt >= SITTING_MS

/** The screens that finish an answered item (Cor. 4.8). */
type FollowUp = Extract<PausablePhase, { name: "step-down" | "reveal" }>

const followUp = (phase: PausablePhase): FollowUp | null =>
  phase.name === "step-down" || phase.name === "reveal" ? phase : null

/**
 * The sitting ends: a pause or a timer running stops. An answered item's
 * step-down or reveal, `interrupted`, is where the next sitting resumes; an
 * item not yet answered begins again.
 */
function endSitting(
  state: LensState,
  interrupted: PausablePhase | null
): LensTransition {
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      phase: {
        name: "sitting-over",
        resume: interrupted && followUp(interrupted),
      },
    },
    effects: [{ type: "stop-speech" }],
  }
}

function startItem(state: LensState, at: number): LensTransition {
  if (sittingOver(state, at)) return endSitting(state, null)
  const item = currentItem(state)
  if (!item) return enter(state, { name: "summary" }, [{ type: "stop-speech" }])
  const heard = item.cue && item.cue.modality !== "glyph"
  return enter(withOutcome(state, { ...OPEN, shownAt: at }), { name: "item" }, [
    { type: "stop-speech" },
    ...(heard && item.cue
      ? [{ type: "speak-cue" as const, text: item.cue.korean }]
      : []),
  ])
}

function withOutcome(state: LensState, outcome: LensOutcome): LensState {
  const outcomes = [...state.outcomes]
  outcomes[state.cursor] = outcome
  return { ...state, outcomes }
}

function reveal(state: LensState): LensTransition {
  return enter(state, { name: "reveal" }, [{ type: "stop-speech" }])
}

function answered(
  state: LensState,
  item: LensItem,
  answer: LensAnswer,
  at: number
): LensTransition {
  const { right, chosen } = graded(item, answer)
  const rights = state.rights + (right ? 1 : 0)
  const offered = right && item.situations !== null && rights % 2 === 1
  const next = withOutcome(
    { ...state, rights },
    {
      ...(currentOutcome(state) ?? OPEN),
      answer,
      right,
      chosen,
      situation: offered ? { chosen: null } : null,
      answeredAt: at,
    }
  )
  if (!right && item.probes.length > 0) {
    return enter(next, { name: "step-down", step: 0 }, [
      { type: "stop-speech" },
    ])
  }
  return reveal(next)
}

function probed(
  state: LensState,
  item: LensItem,
  step: number,
  answer: string
): LensTransition {
  const probe = item.probes[step]
  const outcome = currentOutcome(state)
  if (!probe || !outcome) return { state, effects: [] }
  const right = probeRight(probe, answer)
  const probes = [...outcome.probes, { rung: probe.rung, answer, right }]
  const last = step + 1 >= item.probes.length
  if (right || last) {
    return reveal(
      withOutcome(state, {
        ...outcome,
        probes,
        stepDown: right ? "right" : "ran-out",
        floor: right ? probe.rung : 0,
      })
    )
  }
  return enter(withOutcome(state, { ...outcome, probes }), {
    name: "step-down",
    step: step + 1,
  })
}

function stepDownEnded(state: LensState, end: StepDownEnd): LensTransition {
  const outcome = currentOutcome(state)
  if (!outcome) return { state, effects: [] }
  return reveal(withOutcome(state, { ...outcome, stepDown: end }))
}

/** Leave the reveal: the item is closed, and the next one starts. */
function advance(state: LensState, at: number): LensTransition {
  const next = startItem({ ...state, cursor: state.cursor + 1 }, at)
  return {
    state: next.state,
    effects: [{ type: "closed", index: state.cursor, at }, ...next.effects],
  }
}

function onElapsed(state: LensState, at: number): LensTransition {
  const { phase } = state
  switch (phase.name) {
    case "item": {
      const outcome = currentOutcome(state) ?? OPEN
      return reveal(
        withOutcome(state, { ...outcome, expired: true, answeredAt: at })
      )
    }
    case "step-down": {
      return stepDownEnded(state, "expired")
    }
    case "reveal": {
      return advance(state, at)
    }
    case "summary": {
      return {
        state: { ...state, phase: { name: "idle" } },
        effects: [{ type: "exit" }],
      }
    }
    case "paused": {
      // Only a pause on screen waits (Rem. 4.10).
      return endSitting(state, phase.resume)
    }
    case "idle":
    case "sitting-over": {
      return { state, effects: [] }
    }
    default: {
      return assertNever(phase)
    }
  }
}

const pausable = (phase: LensPhase): phase is PausablePhase =>
  phase.name === "item" ||
  phase.name === "step-down" ||
  phase.name === "reveal" ||
  phase.name === "summary"

/**
 * A pause, under a fresh sequence number: one on screen gets its two
 * minutes; a hidden one shows nothing, so it waits.
 */
function pausedAs(
  state: LensState,
  paused: Extract<LensPhase, { name: "paused" }>,
  effects: Array<LensEffect> = []
): LensTransition {
  if (paused.by === "session") return enter(state, paused, effects)
  return { state: { ...state, seq: state.seq + 1, phase: paused }, effects }
}

/** Wait for the next set, which the host draws and begins. */
const requestSet = (state: LensState): LensTransition => ({
  state: { ...state, seq: state.seq + 1, phase: { name: "idle" } },
  effects: [{ type: "request-set" }],
})

/** Pause the screen showing; past the thirty minutes, end the sitting instead. */
function pauseWith(
  state: LensState,
  by: "hidden" | "session",
  at: number
): LensTransition {
  const { phase } = state
  if (!pausable(phase)) return { state, effects: [] }
  if (sittingOver(state, at)) return endSitting(state, phase)
  return pausedAs(state, { name: "paused", by, resume: phase, since: at }, [
    { type: "stop-speech" },
  ])
}

/** Leave a pause: the screen again with its two minutes, or the sitting's end. */
function resumed(state: LensState, at: number): LensTransition {
  const { phase } = state
  if (phase.name !== "paused") return { state, effects: [] }
  if (sittingOver(state, at)) return endSitting(state, phase.resume)
  const outcome = currentOutcome(state)
  // An item's time to answer leaves out its pauses (Rem. 4.17).
  const waited =
    phase.resume.name === "item" && outcome
      ? withOutcome(state, {
          ...outcome,
          pausedMs: outcome.pausedMs + (at - phase.since),
        })
      : state
  return enter(waited, phase.resume)
}

export function lensReducer(
  state: LensState,
  event: LensEvent
): LensTransition {
  const unchanged: LensTransition = { state, effects: [] }
  const { phase } = state
  const item = currentItem(state)
  switch (event.type) {
    case "begin": {
      if (phase.name !== "idle" || event.items.length === 0) return unchanged
      return startItem(
        {
          ...state,
          items: event.items,
          cursor: 0,
          outcomes: [],
          sittingStartedAt: state.sittingStartedAt ?? event.at,
        },
        event.at
      )
    }
    case "answer": {
      return phase.name === "item" && item
        ? answered(state, item, event.answer, event.at)
        : unchanged
    }
    case "probe": {
      return phase.name === "step-down" && item
        ? probed(state, item, phase.step, event.answer)
        : unchanged
    }
    case "skip-probes": {
      return phase.name === "step-down"
        ? stepDownEnded(state, "skipped")
        : unchanged
    }
    case "situation": {
      const outcome = currentOutcome(state)
      if (phase.name !== "reveal" || !outcome?.situation) return unchanged
      return {
        state: withOutcome(state, {
          ...outcome,
          situation: { chosen: event.chosen },
        }),
        effects: [],
      }
    }
    case "next": {
      return phase.name === "reveal" ? advance(state, event.at) : unchanged
    }
    case "next-set": {
      if (phase.name !== "summary") return unchanged
      if (sittingOver(state, event.at)) {
        return {
          state: {
            ...state,
            phase: { name: "sitting-over", resume: null },
            items: [],
          },
          effects: [],
        }
      }
      return requestSet(state)
    }
    case "elapsed": {
      return event.seq === state.seq ? onElapsed(state, event.at) : unchanged
    }
    case "hidden":
    case "held": {
      const by = event.type === "hidden" ? "hidden" : "session"
      if (phase.name !== "paused") return pauseWith(state, by, event.at)
      if (phase.by === by) return unchanged
      // The same pause, on or off the screen.
      if (sittingOver(state, event.at)) {
        return endSitting(state, phase.resume)
      }
      return pausedAs(state, { ...phase, by })
    }
    case "shown": {
      return resumed(state, event.at)
    }
    case "start-sitting": {
      if (phase.name !== "sitting-over") return unchanged
      const fresh = { ...state, sittingStartedAt: event.at }
      if (phase.resume) return enter(fresh, phase.resume)
      return fresh.items.length > 0
        ? startItem(fresh, event.at)
        : requestSet(fresh)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** One catalogue entry's right and wrong answers in a set, for its summary. */
export type EntryTally = { mistake: MistakeId; right: number; wrong: number }

/**
 * The set's summary, by catalogue entry (Cor. 4.8): an item counts under
 * every entry it showed, and a judge shown as authored is counted apart.
 * An expired item counts as neither right nor wrong.
 */
export function lensSummary(state: LensState): {
  right: number
  answered: number
  entries: Array<EntryTally>
  asWritten: { right: number; answered: number }
} {
  const entries = new Map<MistakeId, EntryTally>()
  const asWritten = { right: 0, answered: 0 }
  let right = 0
  let answeredCount = 0
  state.items.forEach((item, index) => {
    const outcome = state.outcomes[index]
    if (!outcome?.answer) return
    answeredCount += 1
    if (outcome.right) right += 1
    const shown = shownMistakes(item)
    if (shown.length === 0) {
      asWritten.answered += 1
      if (outcome.right) asWritten.right += 1
    }
    for (const mistake of shown) {
      const tally = entries.get(mistake) ?? { mistake, right: 0, wrong: 0 }
      if (outcome.right) tally.right += 1
      else tally.wrong += 1
      entries.set(mistake, tally)
    }
  })
  return {
    right,
    answered: answeredCount,
    entries: [...entries.values()],
    asWritten,
  }
}
