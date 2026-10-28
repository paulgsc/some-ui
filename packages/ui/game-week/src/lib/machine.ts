/**
 * The game-day recorder as one state machine: `step(state, event)` returns
 * the next state and the effects to run, and does nothing else. No React, no
 * microphone, no storage: `runtime.ts` runs the effects and feeds their
 * results back as events, and the component renders a state and turns taps
 * into events (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure:
 *
 * - **One bite at a time.** Opening, recording, finishing and asking are
 *   arms of one union; a tap that would start a second bite while one is
 *   under way does nothing.
 * - **A tap opens the microphone in the same step** (GW1): the `openMic`
 *   effect leaves with the step that read the tap.
 * - **A bite stops itself** (GW2): after the mode's quiet once talking was
 *   heard (`quiet.ts`), and always at one minute (voice-capture's take).
 * - **A bite is kept the moment it stops** (GW3): `keep` leaves with the
 *   step that read the take, held back from home only while Undo, or the
 *   question of what a bite said first was about, is open. A keep that
 *   fails is the store's to hold and try again (`BiteStore.keep`), apart
 *   from this screen, so leaving it loses nothing; an answer or Undo still
 *   reaches the bite there. Its Undo is offered as a kept bite's is, and
 *   the store's word that a later try kept it (`kept`) clears the notice.
 * - **A question or Undo lasts no longer than its bite's hold.** Past the
 *   hold the store lets the bite start on its way home, where nothing can
 *   change it; the clock closes the question, leaving the bite said first
 *   and Later, and an answer that still arrives too late says so.
 * - **Every field is set at the stop** (GW4): `biteFields` from what the
 *   screen showed when talking started. A pick after a bite said first
 *   amends it with `pickedAfter`: the card picked, `seq` the offer on screen
 *   at the stop, and `how` still `said-first` (GB1).
 * - **Nothing records while the page is gone.** Leaving, or the screen
 *   turning off, finishes a bite under way and keeps it; a microphone that
 *   opens after that is let go.
 */
import { assertNever } from "@some-ui/core-utils"
import type { RecordingFailure, Take } from "@some-ui/voice-capture"
import { finishTake, openTake, stepTake } from "@some-ui/voice-capture"

import type { BiteMoment, KeptBite, Said } from "./bite"
import { biteFields, pickedAfter } from "./bite"
import type { Feed, Game, JustHappened, Offer, OfferCard } from "./feed"
import type { ModeId } from "./modes"
import { BITE_LIMITS, MODE_RULES, pregameFrom } from "./modes"
import type { Prefs } from "./ports"
import type { Quiet } from "./quiet"
import { hear, NOT_HEARD, quietEnough } from "./quiet"
import { keptLine, NOTICES } from "./words"

/** How long Undo stays offered after a bite is kept. */
export const UNDO_MS = 5_000

/**
 * How long a bite said first waits for what it was about before it goes
 * home as "Later": the page can be left without answering.
 */
export const ASK_HOLD_MS = 10 * 60_000

export type Activity =
  | { readonly kind: "idle" }
  | {
      readonly kind: "opening"
      readonly said: Said
      readonly moment: BiteMoment
    }
  | {
      readonly kind: "recording"
      readonly said: Said
      readonly moment: BiteMoment
      readonly startedAt: number
      readonly elapsed: number
      readonly level: number
      readonly quiet: Quiet
    }
  | {
      readonly kind: "finishing"
      readonly said: Said
      readonly moment: BiteMoment
      readonly startedAt: number
    }
  /** A bite said first, kept; asking what it was about. */
  | {
      readonly kind: "asking"
      readonly bite: KeptBite
      readonly moment: BiteMoment
      readonly startedAt: number
      /** What the screen offered as the bite stopped. */
      readonly offer: OfferView | null
    }

/** An offer as this mode shows it, at one moment. */
export type OfferView = {
  readonly seq: number
  readonly strip: string
  /** Likeliest first. */
  readonly cards: ReadonlyArray<OfferCard>
  /** Newest first. */
  readonly justHappened: ReadonlyArray<JustHappened>
}

export type GameWeekState = {
  readonly page: "new" | "here" | "left"
  readonly visible: boolean
  /** The clock, as last read. */
  readonly now: number
  readonly games: ReadonlyArray<Game>
  readonly offer: Offer | null
  readonly prefs: Prefs
  readonly activity: Activity
  /**
   * Bites handed to the store and not yet kept, each with the hold the
   * store has for it (an answer given meanwhile moves it): Undo's end.
   * `held` once the store said it could not keep the bite yet and holds it
   * to try again, until it says a try kept it.
   */
  readonly keeping: ReadonlyArray<{
    readonly id: string
    readonly holdUntil: number
    readonly held: boolean
  }>
  /**
   * The bite Undo would throw away, and until when; `until` is null while
   * a bite said first still asks what it was about.
   */
  readonly undo: { readonly id: string; readonly until: number | null } | null
  readonly blocked: RecordingFailure | null
  readonly notice: string
}

/** What the person does. */
export type GameWeekIntent =
  | { readonly type: "say"; readonly said: Said }
  | { readonly type: "done" }
  | { readonly type: "answer"; readonly said: Said | null }
  | { readonly type: "undo" }
  | { readonly type: "pickGame"; readonly gameId: string }
  | { readonly type: "toggleWatching"; readonly gameId: string }
  | { readonly type: "pickMode"; readonly mode: ModeId }

/** What the page, the clock, home and the store report. */
type GameWeekSignal =
  | { readonly type: "arrived" }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  | { readonly type: "clock"; readonly now: number }
  | { readonly type: "fed"; readonly feed: Feed }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | {
      readonly type: "taken"
      readonly take: Take
      readonly id: string
      readonly at: number
    }
  | { readonly type: "takeFailed" }
  | { readonly type: "kept"; readonly id: string }
  | { readonly type: "keepFailed"; readonly id: string }
  | {
      readonly type: "amendFailed"
      /** The bite was already on its way home, as it was. */
      readonly onItsWay: boolean
    }
  | { readonly type: "undoFailed" }

export type GameWeekEvent = GameWeekIntent | GameWeekSignal

export type GameWeekEffect =
  | { readonly type: "openMic" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | { readonly type: "finishTake" }
  | { readonly type: "discardTake" }
  | { readonly type: "keep"; readonly bite: KeptBite; readonly audio: Blob }
  | {
      readonly type: "amend"
      readonly id: string
      readonly fields: Readonly<Record<string, string>>
      readonly holdUntil: number
    }
  | { readonly type: "release"; readonly id: string }
  | { readonly type: "undo"; readonly id: string }
  | { readonly type: "savePrefs"; readonly prefs: Prefs }

export type Step = {
  readonly state: GameWeekState
  readonly effects: ReadonlyArray<GameWeekEffect>
}

export function initialState(prefs: Prefs, now: number): GameWeekState {
  return {
    page: "new",
    visible: true,
    now,
    games: [],
    offer: null,
    prefs,
    activity: { kind: "idle" },
    keeping: [],
    undo: null,
    blocked: null,
    notice: "",
  }
}

const stay = (state: GameWeekState): Step => ({ state, effects: [] })

/** The game the screen is on: the one picked, while the week still has it. */
export function currentGame(state: GameWeekState): Game | null {
  return (
    state.games.find((game) => game.id === state.prefs.gameId) ??
    state.games[0] ??
    null
  )
}

export function isWatching(prefs: Prefs, gameId: string): boolean {
  return !prefs.notWatching.includes(gameId)
}

/**
 * What the screen offers now for the current game in this mode, or null
 * when home has offered nothing for it (away): the likeliest cards up to
 * the mode's number, pregame ones only from the mode's pregame start, and
 * what just happened while the mode still shows it.
 */
export function offerView(state: GameWeekState): OfferView | null {
  const game = currentGame(state)
  const { offer, now } = state
  if (game === null || offer?.gameId !== game.id) return null
  const rules = MODE_RULES[state.prefs.mode]
  const pregameOpen = now >= pregameFrom(Date.parse(game.kickoff), rules)
  const cards = [...offer.cards]
    .filter((card) => pregameOpen || !card.scenario.startsWith("pre."))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, rules.cards)
  const justHappened = offer.justHappened
    .filter((each) => {
      const age = now - Date.parse(each.at)
      // Home's clock can run a little ahead of the phone's: just now.
      return Math.max(0, age) <= rules.justHappened.keepMs
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, rules.justHappened.count)
  return { seq: offer.seq, strip: offer.strip, cards, justHappened }
}

function withPrefs(state: GameWeekState, prefs: Prefs): Step {
  return {
    state: { ...state, prefs },
    effects: [{ type: "savePrefs", prefs }],
  }
}

/** The previous bite's Undo closes, and it may go home, when another opens. */
function closeUndo(state: GameWeekState): Step {
  if (state.undo === null) return stay(state)
  return {
    state: { ...state, undo: null },
    effects: [{ type: "release", id: state.undo.id }],
  }
}

function start(state: GameWeekState, said: Said): Step {
  const game = currentGame(state)
  if (game === null) return stay({ ...state, notice: NOTICES.pickFirst })
  const view = offerView(state)
  const moment: BiteMoment = {
    gameId: game.id,
    seq: view?.seq ?? null,
    strip: view?.strip ?? "",
    watching: isWatching(state.prefs, game.id),
    mode: state.prefs.mode,
  }
  const closed = closeUndo(state)
  return {
    state: {
      ...closed.state,
      activity: { kind: "opening", said, moment },
      blocked: null,
      notice: "",
    },
    effects: [...openTake().effects, ...closed.effects],
  }
}

function finish(state: GameWeekState): Step {
  const { activity } = state
  if (activity.kind !== "recording") return stay(state)
  const next = finishTake(activity)
  return {
    state: {
      ...state,
      activity: {
        kind: "finishing",
        said: activity.said,
        moment: activity.moment,
        startedAt: activity.startedAt,
      },
    },
    effects: next.effects,
  }
}

/** Leaving the asking screen: what the bite was about is settled as `fields`. */
function settle(
  state: GameWeekState,
  bite: KeptBite,
  fields: Readonly<Record<string, string>>
): Step {
  const holdUntil = state.now + UNDO_MS
  return {
    state: {
      ...state,
      activity: { kind: "idle" },
      // Undo stays offered a few seconds more; a bite the store has not
      // answered for yet gets its Undo once it does, until the hold this
      // answer gave it.
      keeping: state.keeping.map((each) =>
        each.id === bite.id ? { ...each, holdUntil } : each
      ),
      undo:
        state.undo?.id === bite.id
          ? { id: bite.id, until: holdUntil }
          : state.undo,
    },
    effects: [{ type: "amend", id: bite.id, fields, holdUntil }],
  }
}

/**
 * The store has answered for `entry`, kept or held: Undo opens on it, until
 * the store's own hold ends, or while its question is still asked.
 */
function offerUndo(
  state: GameWeekState,
  entry: GameWeekState["keeping"][number]
): Step {
  const { activity } = state
  if (activity.kind === "asking" && activity.bite.id === entry.id)
    return stay({ ...state, undo: { id: entry.id, until: null } })
  // Its hold already ran out: the bite is on its way, past undoing.
  if (state.now >= entry.holdUntil) return stay(state)
  const closed = closeUndo(state)
  return {
    state: {
      ...closed.state,
      // The store's own hold: Undo is offered exactly while it takes one.
      undo: { id: entry.id, until: entry.holdUntil },
    },
    effects: closed.effects,
  }
}

export function step(state: GameWeekState, event: GameWeekEvent): Step {
  const { activity } = state
  switch (event.type) {
    case "arrived": {
      return stay({ ...state, page: "here" })
    }

    case "left": {
      const gone = { ...state, page: "left" as const }
      return finish(gone)
    }

    case "hidden": {
      return finish({ ...state, visible: false })
    }

    case "shown": {
      return stay({ ...state, visible: true })
    }

    case "clock": {
      const ticked = { ...state, now: event.now }
      const { undo } = state
      if (activity.kind === "asking" && event.now >= activity.bite.holdUntil)
        // The store has let the bite start on its way home as it was: said
        // first, Later. Nothing can amend or throw it away now.
        return stay({
          ...ticked,
          activity: { kind: "idle" },
          undo: undo?.id === activity.bite.id ? null : undo,
          notice: NOTICES.askClosed,
        })
      if (undo?.until === null || undo === null || event.now < undo.until)
        return stay(ticked)
      return closeUndo(ticked)
    }

    case "fed": {
      return stay({
        ...state,
        games: event.feed.games,
        offer: event.feed.offer,
      })
    }

    case "say": {
      if (activity.kind !== "idle") return stay(state)
      return start(state, event.said)
    }

    case "done": {
      return finish(state)
    }

    case "micOpened": {
      if (activity.kind !== "opening") return stay(state)
      if (state.page === "left" || !state.visible)
        return {
          state: {
            ...state,
            activity: { kind: "idle" },
            notice: state.page === "left" ? state.notice : NOTICES.notStarted,
          },
          effects: [{ type: "discardTake" }],
        }
      const next = stepTake({ kind: "opening" }, event, BITE_LIMITS)
      return {
        state: {
          ...state,
          now: event.at,
          activity: {
            kind: "recording",
            said: activity.said,
            moment: activity.moment,
            startedAt: event.at,
            elapsed: 0,
            level: 0,
            quiet: NOT_HEARD,
          },
        },
        effects: next.effects,
      }
    }

    case "micFailed": {
      if (activity.kind !== "opening") return stay(state)
      return stay({
        ...state,
        activity: { kind: "idle" },
        blocked: event.reason,
      })
    }

    case "ticked": {
      if (activity.kind !== "recording") return stay(state)
      const next = stepTake(activity, event, BITE_LIMITS)
      const quiet = hear(activity.quiet, event.level, event.now)
      const recording = {
        ...activity,
        elapsed: Math.min(event.now - activity.startedAt, BITE_LIMITS.maxMs),
        level: event.level,
        quiet,
      }
      const ticked = { ...state, now: event.now, activity: recording }
      // The minute: the take itself stops.
      if (next.kind === "taking" && next.phase.kind === "finishing")
        return finish(ticked)
      if (
        quietEnough(quiet, event.now, MODE_RULES[activity.moment.mode].quietMs)
      )
        return finish(ticked)
      return stay(ticked)
    }

    case "taken": {
      if (activity.kind !== "finishing") return stay(state)
      const next = stepTake({ kind: "finishing" }, event, BITE_LIMITS)
      if (next.kind !== "kept")
        return stay({
          ...state,
          activity: { kind: "idle" },
          notice: NOTICES.tooShort,
        })
      const { take } = next
      const saidFirst = activity.said.how === "said-first"
      const bite: KeptBite = {
        id: event.id,
        gameId: activity.moment.gameId,
        at: new Date(event.at).toISOString(),
        contentType: take.mimeType,
        durationMs: Math.min(take.durationMs, BITE_LIMITS.maxMs),
        fields: biteFields(activity.said, activity.moment, activity.startedAt),
        holdUntil: event.at + (saidFirst ? ASK_HOLD_MS : UNDO_MS),
      }
      const kept = {
        ...state,
        now: event.at,
        keeping: [
          ...state.keeping,
          { id: bite.id, holdUntil: bite.holdUntil, held: false },
        ],
        notice: keptLine(bite.durationMs),
      }
      const keep: GameWeekEffect = { type: "keep", bite, audio: take.blob }
      if (!saidFirst || state.page === "left")
        return {
          state: { ...kept, activity: { kind: "idle" } },
          effects: [keep],
        }
      return {
        state: {
          ...kept,
          activity: {
            kind: "asking",
            bite,
            moment: activity.moment,
            startedAt: activity.startedAt,
            offer: offerView(kept),
          },
        },
        effects: [keep],
      }
    }

    case "takeFailed": {
      if (activity.kind !== "finishing") return stay(state)
      return stay({
        ...state,
        activity: { kind: "idle" },
        notice: NOTICES.notTaken,
      })
    }

    case "kept": {
      const entry = state.keeping.find(({ id }) => id === event.id)
      if (entry === undefined) return stay(state)
      const settled = {
        ...state,
        keeping: state.keeping.filter((each) => each !== entry),
      }
      // A try the store made later: its Undo was offered when it failed.
      if (entry.held)
        return stay({
          ...settled,
          notice:
            state.notice === NOTICES.notKept ? NOTICES.keptNow : state.notice,
        })
      return offerUndo(settled, entry)
    }

    case "keepFailed": {
      // The store holds the bite and tries again; an answer still being
      // asked, and Undo while its hold lasts, reach it there.
      const entry = state.keeping.find(({ id }) => id === event.id)
      if (entry === undefined || entry.held) return stay(state)
      const held = {
        ...state,
        keeping: state.keeping.map((each) =>
          each === entry ? { ...each, held: true } : each
        ),
      }
      const offered = offerUndo(held, entry)
      return {
        ...offered,
        state: { ...offered.state, notice: NOTICES.notKept },
      }
    }

    case "answer": {
      if (activity.kind !== "asking") return stay(state)
      const { said } = event
      if (said === null)
        return settle(state, activity.bite, activity.bite.fields)
      // Picked from what was offered as it stopped: that offer is the one
      // the bite names.
      const moment =
        activity.offer === null || said.how === "every-scenario"
          ? activity.moment
          : { ...activity.moment, seq: activity.offer.seq }
      // Picked after it was said: the bite still says it was said first.
      return settle(
        state,
        activity.bite,
        pickedAfter(said, moment, activity.startedAt)
      )
    }

    case "undo": {
      const { undo } = state
      if (undo === null || (undo.until !== null && state.now >= undo.until))
        return stay(state)
      return {
        state: {
          ...state,
          undo: null,
          // A bite the store still holds to try again is thrown away there.
          keeping: state.keeping.filter(({ id }) => id !== undo.id),
          activity:
            activity.kind === "asking" && activity.bite.id === undo.id
              ? { kind: "idle" }
              : activity,
          notice: NOTICES.thrownAway,
        },
        effects: [{ type: "undo", id: undo.id }],
      }
    }

    case "amendFailed": {
      // That the bite itself isn't kept yet is the news that matters more.
      if (state.notice === NOTICES.notKept) return stay(state)
      return stay({
        ...state,
        notice: event.onItsWay ? NOTICES.tooLateToNote : NOTICES.notNoted,
      })
    }

    case "undoFailed": {
      return stay({ ...state, notice: NOTICES.tooLateToUndo })
    }

    case "pickGame": {
      if (!state.games.some((game) => game.id === event.gameId))
        return stay(state)
      return withPrefs(state, { ...state.prefs, gameId: event.gameId })
    }

    case "toggleWatching": {
      const { notWatching } = state.prefs
      return withPrefs(state, {
        ...state.prefs,
        notWatching: notWatching.includes(event.gameId)
          ? notWatching.filter((id) => id !== event.gameId)
          : [...notWatching, event.gameId],
      })
    }

    case "pickMode": {
      return withPrefs(state, { ...state.prefs, mode: event.mode })
    }

    default: {
      return assertNever(event)
    }
  }
}
