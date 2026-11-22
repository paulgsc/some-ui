/**
 * The game-day recorder as one state machine: `step(state, event)` returns
 * the next state and the effects to run, and does nothing else. No React, no
 * microphone, no storage: `runtime.ts` runs the effects and feeds their
 * results back as events, and the component renders a state and turns taps
 * into events (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure:
 *
 * - **A bite is a take of the take pattern** (`@some-ui/voice-capture`),
 *   whose step this embeds (`takes`, with `BITE_TAKES`): it opens, records,
 *   finishes and ends exactly as every screen's take does, and plays a kept
 *   bite back. This keeps no copy of that, only what is the bite's own (what
 *   it is said about, when talking started, the quiet so far).
 * - **One bite at a time.** Taking and asking are arms of one union, and a
 *   tap that would start a second bite while one is under way does nothing.
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
 *   screen showed when talking started. Its unit (#3049) is the ranked
 *   list's for its scenario unless one is named, and one tap moves it to the
 *   next while the bite is said (`pickUnit`); it goes home once, with the
 *   bite. A pick after a bite said first
 *   amends it with `pickedAfter`: the card picked, `seq` the offer on screen
 *   at the stop, and `how` still `said-first` (GB1).
 * - **Nothing records while the page is gone.** Leaving, or the screen
 *   turning off, finishes a bite under way and keeps it; a microphone that
 *   opens after that is let go.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  PatternTake,
  RecordingFailure,
  Take,
  TakeButtonView,
  TakeEnded,
  TakeKitView,
  TakePatternEffect,
  TakePatternEvent,
  TakePatternOptions,
  TakePatternState,
  TakeRowView,
} from "@some-ui/voice-capture"
import {
  initialTakePattern,
  stepTakePattern,
  takeItemView,
  takeKitView,
  takePatternSnapshot,
} from "@some-ui/voice-capture"

import type { BiteMoment, KeptBite, Said } from "./bite"
import { biteAbout, biteFields, pickedAfter } from "./bite"
import type {
  Feed,
  FeedChoice,
  FeedLink,
  Game,
  JustHappened,
  Offer,
  OfferCard,
} from "./feed"
import type { ModeId } from "./modes"
import { BITE_LIMITS, MODE_RULES, pregameFrom } from "./modes"
import type { Prefs, StoredBite } from "./ports"
import type { Quiet } from "./quiet"
import { hear, NOT_HEARD, quietEnough } from "./quiet"
import type { RankedEntry } from "./ranked"
import { nextUnit, otherSide, rankedList, unitOf } from "./ranked"
import { keptLine, NOTICES } from "./words"

/**
 * How many of the game's bites show under the recorder, newest first
 * (GWB14, #3039): enough to see the last few just said, while the screen
 * stays the recorder. Policy, moved with the story (C970).
 */
export const RECENT_BITES = 3

/** How long Undo stays offered after a bite is kept. */
export const UNDO_MS = 5_000

/**
 * How long a bite said first waits for what it was about before it goes
 * home as "Later": the page can be left without answering.
 */
export const ASK_HOLD_MS = 10 * 60_000

/** What every bite answers: the screen's one item. */
const BITE_ITEM = "game-week"

/**
 * The take pattern's options for a bite: each bite stands on its own (the
 * pattern holds one at a time, `max: 1`, and the next makes room; the screen
 * lists the game's newest, `RECENT_BITES`), within
 * `BITE_LIMITS`, played back on its row. Redo and Let go aren't offered:
 * a bite is Undone while its hold lasts, and past it is on its way home.
 */
const BITE_TAKES: TakePatternOptions = {
  takes: { per: "many", max: 1, full: "make-room" },
  limits: BITE_LIMITS,
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
  clock: "elapsed",
}

export type Activity =
  | { readonly kind: "idle" }
  /** A bite under way: the take is `takes`'; this is what it is about. */
  | {
      readonly kind: "taking"
      readonly said: Said
      readonly moment: BiteMoment
      /** When the microphone opened; null while it opens. */
      readonly startedAt: number | null
      readonly quiet: Quiet
    }
  /** A bite said first, kept; asking what it was about. */
  | {
      readonly kind: "asking"
      readonly bite: KeptBite
      readonly moment: BiteMoment
      readonly startedAt: number
      /** What the screen offered as the bite stopped. */
      readonly offer: OfferView | null
      /**
       * The ranked list as the bite stopped: the units a scenario picked
       * now is about, as home ranked them for that same offer.
       */
      readonly ranked: ReadonlyArray<RankedEntry>
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
  /** How the phone stands with home: why there is no live offer. */
  readonly link: FeedLink
  /** Home's clock minus the phone's, as last measured (GW5). */
  readonly offsetMs: number | null
  readonly prefs: Prefs
  readonly activity: Activity
  /** The take pattern's state: the bite's take, and what plays. */
  readonly takes: TakePatternState
  /** The newest bite taken on this visit: the one Undo may be offered on. */
  readonly lastTaken: string | null
  /**
   * Every bite the store keeps on this phone, as it last said (`stored`):
   * the game's newest show under the recorder (`biteView`), each from the
   * moment the store has kept it.
   */
  readonly shelf: ReadonlyArray<StoredBite>
  /**
   * Bites Undo was tapped on and the store hasn't answered for: their rows
   * stay gone whatever the store says meanwhile, and come back if it
   * couldn't throw them away.
   */
  readonly undoing: ReadonlyArray<string>
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
  /** Moves the bite being said to the next unit (#3049). */
  | { readonly type: "pickUnit" }
  /** Makes the bite being said about the game's other team (#3049). */
  | { readonly type: "switchSide" }
  | { readonly type: "undo" }
  | { readonly type: "pickGame"; readonly gameId: string }
  | { readonly type: "toggleWatching"; readonly gameId: string }
  | { readonly type: "pickMode"; readonly mode: ModeId }
  /** Plays the bite on its row, or stops it while it plays. */
  | { readonly type: "play"; readonly id: string }

/** What the page, the clock, home and the store report. */
type GameWeekSignal =
  | { readonly type: "arrived" }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  | { readonly type: "clock"; readonly now: number }
  | { readonly type: "fed"; readonly feed: Feed }
  | {
      readonly type: "ticked"
      readonly now: number
      readonly level: number
      readonly metered?: boolean | undefined
    }
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
  | { readonly type: "undoFailed"; readonly id: string }
  /** What the store keeps now, after a change. */
  | { readonly type: "stored"; readonly bites: ReadonlyArray<StoredBite> }
  | Extract<TakePatternEvent, { type: "loaded" | "played" }>

export type GameWeekEvent = GameWeekIntent | GameWeekSignal

export type GameWeekEffect =
  /** The take pattern's: the microphone, the clock and the playback. */
  | Exclude<TakePatternEffect, { type: "keep" | "setAside" | "discard" }>
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
    link: "asking",
    offsetMs: null,
    prefs,
    activity: { kind: "idle" },
    takes: initialTakePattern,
    lastTaken: null,
    shelf: [],
    undoing: [],
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
 * What home is told the recorder is on: the mode, the game on screen and
 * the watching flag of every game of the week. The runtime tells the feed
 * whenever this changes.
 */
export function homeChoice(state: GameWeekState): FeedChoice {
  return {
    mode: state.prefs.mode,
    gameId: currentGame(state)?.id ?? null,
    watching: Object.fromEntries(
      state.games.map((game) => [game.id, isWatching(state.prefs, game.id)])
    ),
  }
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

/** The ranked list (`./ranked`) for the current game only: another game's offer ranks nothing here. */
export function rankedNow(state: GameWeekState): ReadonlyArray<RankedEntry> {
  const game = currentGame(state)
  const { offer } = state
  return rankedList(
    game !== null && offer?.gameId === game.id ? (offer.ranked ?? null) : null
  )
}

/**
 * `said` with the unit `list` gives its scenario, unless it names one (a
 * play that just happened names its own, when home read one off it). The
 * owner sees it on the chip and can change it.
 */
function withUnit(list: ReadonlyArray<RankedEntry>, said: Said): Said {
  if (said.how === "said-first" || said.unit !== undefined) return said
  return { ...said, unit: unitOf(list, said.scenario) }
}

/**
 * The team a bite is about when no unit is named on it: the play's own,
 * when it just happened and home read one off it, else the list's.
 */
function teamOf(
  state: GameWeekState,
  said: Exclude<Said, { how: "said-first" }>
): string | null {
  if (said.how === "just-happened") {
    const play = state.offer?.justHappened.find(
      (each) => each.scenario === said.scenario && each.context === said.context
    )
    if (play?.unit !== undefined) return play.unit?.side ?? null
  }
  return unitOf(rankedNow(state), said.scenario)?.side ?? null
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

/** The bite's take as the screen shows it. */
function takeOf(state: GameWeekState): TakeKitView {
  return takeKitView(state.takes.kit, BITE_LIMITS)
}

/** A bite the store keeps, as a take of the pattern. */
function asPatternTake(bite: StoredBite): PatternTake {
  return {
    id: bite.id,
    answers: BITE_ITEM,
    durationMs: bite.durationMs,
    recordedAt: bite.at,
    standing: "current",
    kept:
      bite.homeSince === undefined
        ? // On this phone, waiting there until home holds it.
          { place: "going" }
        : { place: "home", since: new Date(bite.homeSince).toISOString() },
  }
}

/** One of the game's bites under the recorder: its row, and what it was about. */
export type RecentBite = {
  readonly row: TakeRowView
  /** The clock it was said at, its scenario and unit, in the person's words. */
  readonly about: string
  /** Its sound couldn't play here: the take pattern's one line about it. */
  readonly unplayable: boolean
}

/**
 * The bite as the take pattern's parts show it: its button while it records,
 * and the game's newest bites the store has kept as rows (`RECENT_BITES`,
 * GWB14), each saying when it couldn't play. Home
 * holds a bite's sound once it holds the bite, and the phone lets it go then,
 * so a bite on home has nothing to play here.
 */
export function biteView(state: GameWeekState): {
  readonly button: TakeButtonView
  readonly recent: ReadonlyArray<RecentBite>
} {
  const gameId = currentGame(state)?.id
  const recent = state.shelf
    .filter(
      (bite) => bite.gameId === gameId && !state.undoing.includes(bite.id)
    )
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, RECENT_BITES)
  const snapshot = takePatternSnapshot(state.takes, BITE_TAKES)
  const view = takeItemView(
    snapshot,
    recent.map(asPatternTake),
    BITE_ITEM,
    BITE_TAKES
  )
  const about = new Map(recent.map((bite) => [bite.id, biteAbout(bite.fields)]))
  return {
    button: view.button,
    recent: view.current.map((row) => ({
      row: { ...row, canPlay: row.canPlay && row.take.kept?.place !== "home" },
      about: about.get(row.take.id) ?? "",
      unplayable: snapshot.unplayable === row.take.id,
    })),
  }
}

/** Where the screen is: at rest, a take's phase, or asking about a bite. */
export function phaseOf(
  state: GameWeekState
): "idle" | "opening" | "recording" | "finishing" | "asking" {
  if (state.activity.kind === "asking") return "asking"
  const take = takeOf(state)
  if (take.kind === "keeping") return "finishing"
  return take.kind
}

/**
 * The take pattern's step on `event`. What it hands to keep comes back as
 * `keep`, for the bite to be made of; the rest are this screen's effects.
 */
function withTakes(
  state: GameWeekState,
  event: TakePatternEvent
): Step & { readonly keep: Take | null } {
  const next = stepTakePattern(state.takes, event, BITE_TAKES)
  let keep: Take | null = null
  const effects: Array<GameWeekEffect> = []
  for (const effect of next.effects) {
    if (effect.type === "keep") keep = effect.take
    // Bites have no Let go, and are sent at once, so nothing is set aside
    // or deleted for good here.
    else if (effect.type !== "setAside" && effect.type !== "discard")
      effects.push(effect)
  }
  const moved =
    next.state === state.takes ? state : { ...state, takes: next.state }
  return { ...ended(moved, state.takes.kit.ended), effects, keep }
}

/**
 * A take that ended other than kept leaves the screen at rest, saying how;
 * a kept one is the bite's (`taken`).
 */
function ended(state: GameWeekState, before: TakeEnded | null): Step {
  const last = state.takes.kit.ended
  if (last === before || last === null || last.ending === "kept")
    return stay(state)
  const rest = { ...state, activity: { kind: "idle" } as const }
  switch (last.ending) {
    case "short": {
      return stay({ ...rest, notice: NOTICES.tooShort })
    }
    case "early": {
      // Left: nobody is there to read it; hidden: the screen went; else the
      // person tapped before the microphone was listening.
      if (state.page === "left") return stay(rest)
      return stay({
        ...rest,
        notice: state.visible ? NOTICES.early : NOTICES.notStarted,
      })
    }
    case "blocked": {
      return stay({ ...rest, blocked: last.reason ?? "failed" })
    }
    case "failed":
    case "full": {
      return stay({ ...rest, notice: NOTICES.notTaken })
    }
    default: {
      return assertNever(last.ending)
    }
  }
}

function start(state: GameWeekState, told: Said): Step {
  const said = withUnit(rankedNow(state), told)
  const game = currentGame(state)
  if (game === null) return stay({ ...state, notice: NOTICES.pickFirst })
  const view = offerView(state)
  const moment: BiteMoment = {
    gameId: game.id,
    seq: view?.seq ?? null,
    strip: view?.strip ?? "",
    watching: isWatching(state.prefs, game.id),
    mode: state.prefs.mode,
    offsetMs: state.offsetMs,
  }
  const closed = closeUndo(state)
  const opened = withTakes(
    {
      ...closed.state,
      activity: {
        kind: "taking",
        said,
        moment,
        startedAt: null,
        quiet: NOT_HEARD,
      },
      blocked: null,
      notice: "",
    },
    { type: "tap", answers: BITE_ITEM, supersedes: null }
  )
  return {
    state: opened.state,
    effects: [...opened.effects, ...closed.effects],
  }
}

/** Stops a bite recording and keeps it; nothing for one still opening. */
function finish(state: GameWeekState): Step {
  if (takeOf(state).kind !== "recording") return stay(state)
  return withTakes(state, { type: "tap", answers: BITE_ITEM, supersedes: null })
}

/** The page went, or went off screen: a bite recording is kept. */
function gone(state: GameWeekState): Step {
  return withTakes(state, { type: "left" })
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
      return gone({ ...state, page: "left" })
    }

    case "hidden": {
      return gone({ ...state, visible: false })
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
        link: event.feed.link,
        offsetMs: event.feed.offsetMs,
      })
    }

    case "say": {
      if (activity.kind !== "idle" || takeOf(state).kind !== "idle")
        return stay(state)
      return start(state, event.said)
    }

    case "done": {
      // The take button stays tappable while the microphone opens (D1): a
      // tap then lets the bite go before it starts.
      if (takeOf(state).kind === "opening")
        return withTakes(state, {
          type: "tap",
          answers: BITE_ITEM,
          supersedes: null,
        })
      return finish(state)
    }

    case "micOpened": {
      const opened = withTakes(state, event)
      const { activity: now } = opened.state
      if (takeOf(opened.state).kind !== "recording" || now.kind !== "taking")
        return opened
      return {
        ...opened,
        state: {
          ...opened.state,
          now: event.at,
          activity: { ...now, startedAt: event.at },
        },
      }
    }

    case "micFailed":
    case "takeFailed":
    case "loaded":
    case "played": {
      return withTakes(state, event)
    }

    case "ticked": {
      const ticked = withTakes({ ...state, now: event.now }, event)
      const { activity: taking } = ticked.state
      // The minute: the take stopped itself.
      if (takeOf(ticked.state).kind !== "recording" || taking.kind !== "taking")
        return ticked
      const quiet = hear(taking.quiet, event.level, event.now)
      const heard = {
        ...ticked.state,
        activity: { ...taking, quiet },
      }
      if (
        !quietEnough(quiet, event.now, MODE_RULES[taking.moment.mode].quietMs)
      )
        return { state: heard, effects: ticked.effects }
      const stopped = finish(heard)
      return {
        state: stopped.state,
        effects: [...ticked.effects, ...stopped.effects],
      }
    }

    case "taken": {
      if (activity.kind !== "taking") return stay(state)
      const handed = withTakes(state, { type: "taken", take: event.take })
      const take = handed.keep
      if (take === null) return handed
      const startedAt = activity.startedAt ?? event.at
      const saidFirst = activity.said.how === "said-first"
      const bite: KeptBite = {
        id: event.id,
        gameId: activity.moment.gameId,
        at: new Date(event.at).toISOString(),
        contentType: take.mimeType,
        durationMs: Math.min(take.durationMs, BITE_LIMITS.maxMs),
        fields: biteFields(activity.said, activity.moment, startedAt),
        holdUntil: event.at + (saidFirst ? ASK_HOLD_MS : UNDO_MS),
      }
      // The store holds a bite it could not keep yet and tries again, so the
      // take is kept the moment it is handed over (GW3).
      const kept = withTakes(handed.state, {
        type: "kept",
        result: { outcome: "kept", id: bite.id },
      })
      const at = {
        ...kept.state,
        now: event.at,
        keeping: [
          ...state.keeping,
          { id: bite.id, holdUntil: bite.holdUntil, held: false },
        ],
        lastTaken: bite.id,
        notice: keptLine(bite.durationMs),
      } satisfies GameWeekState
      const effects: Array<GameWeekEffect> = [
        ...handed.effects,
        ...kept.effects,
        { type: "keep", bite, audio: take.blob },
      ]
      if (!saidFirst || state.page === "left")
        return { state: { ...at, activity: { kind: "idle" } }, effects }
      return {
        state: {
          ...at,
          activity: {
            kind: "asking",
            bite,
            moment: activity.moment,
            startedAt,
            offer: offerView(at),
            ranked: rankedNow(at),
          },
        },
        effects,
      }
    }

    case "play": {
      return withTakes(state, event)
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
      // Kept after the next bite was taken: Undo offers only the bite on
      // screen, so this one may go home now.
      if (state.lastTaken !== event.id)
        return {
          state: settled,
          effects: [{ type: "release", id: event.id }],
        }
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
      // Not the bite on screen any more: no Undo for it either.
      if (state.lastTaken !== event.id)
        return stay({ ...held, notice: NOTICES.notKept })
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
        pickedAfter(withUnit(activity.ranked, said), moment, activity.startedAt)
      )
    }

    case "pickUnit": {
      if (activity.kind !== "taking" || activity.said.how === "said-first")
        return stay(state)
      const { said: was } = activity
      const said = {
        ...was,
        unit: nextUnit(was.unit ?? null, teamOf(state, was)),
      }
      return stay({ ...state, activity: { ...activity, said } })
    }

    case "switchSide": {
      const teams = currentGame(state)?.teams
      if (
        activity.kind !== "taking" ||
        activity.said.how === "said-first" ||
        activity.said.unit == null ||
        teams === undefined
      )
        return stay(state)
      const unit = otherSide(activity.said.unit, teams)
      const said = { ...activity.said, unit }
      return stay({ ...state, activity: { ...activity, said } })
    }

    case "undo": {
      const { undo } = state
      if (undo === null || (undo.until !== null && state.now >= undo.until))
        return stay(state)
      // Its row goes, and nothing plays what was thrown away.
      const { playback } = state.takes
      const quiet =
        playback.kind !== "quiet" && playback.id === undo.id
          ? withTakes(state, { type: "stopPlaying" })
          : stay(state)
      return {
        state: {
          ...quiet.state,
          undo: null,
          // A bite the store still holds to try again is thrown away there.
          keeping: state.keeping.filter(({ id }) => id !== undo.id),
          activity:
            activity.kind === "asking" && activity.bite.id === undo.id
              ? { kind: "idle" }
              : activity,
          lastTaken: state.lastTaken === undo.id ? null : state.lastTaken,
          // Its row goes now, until the store says whether it could.
          undoing: [...state.undoing, undo.id],
          notice: NOTICES.thrownAway,
        },
        effects: [...quiet.effects, { type: "undo", id: undo.id }],
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

    case "stored": {
      // A bite the store no longer keeps needs hiding no longer.
      const kept = new Set(event.bites.map(({ id }) => id))
      return stay({
        ...state,
        shelf: event.bites,
        undoing: state.undoing.filter((id) => kept.has(id)),
      })
    }

    case "undoFailed": {
      // Still kept, and on its way home: its row comes back.
      return stay({
        ...state,
        undoing: state.undoing.filter((id) => id !== event.id),
        notice: NOTICES.tooLateToUndo,
      })
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
