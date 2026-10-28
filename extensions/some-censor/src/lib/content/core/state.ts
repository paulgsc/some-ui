/**
 * Core's state (BC3) — Boundary Contract B8: one explicit value, threaded
 * through pure reducers, never a private field.
 *
 * Plain data keyed by {@link CardKey}, so a recorded event log folds back into
 * the same state every time and the diagnostics page can render it directly.
 */

import type { ViewState, WatchView } from "@censor/lib/content/fsm"
import { admitted } from "@censor/lib/content/fsm"
import type { MusicSigns } from "@censor/lib/content/lane/lane"
import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import type { VideoId } from "@censor/types/ids"
import type { SessionId } from "@some-extension/common"

import type { CardKey } from "./keys"
import type { Observation, WatchObservation } from "./observation"

export type CardState = {
  readonly key: CardKey
  readonly observation: Observation
  /** Decided by `observation` alone (`fsm.ts`'s `decide`), never by a gesture. */
  readonly view: ViewState
  /** When the card was first observed, and when it was last. */
  readonly firstSeenAt: number
  readonly lastSeenAt: number
}

type WatchDates = {
  readonly videoId: WatchObservation["videoId"]
  readonly dates: ReadonlyArray<string>
}

/** The page's own video (#1805), decided as a card is. */
export type WatchState = {
  /** The page's video, with only the dates that are its own. */
  readonly observation: WatchObservation
  readonly view: WatchView
  /**
   * The owner held for the real thumbnail (QD13): for this plated view
   * only, gone with the video, the plate, or a navigation.
   */
  readonly face: boolean
  /** When it was last observed: what the boundary re-decides it at. */
  readonly seenAt: number
}

type Phase = "idle" | "running"

/** When a full hold on the face control shows the thumbnail. */
export type FaceWhen = "release" | "held"

/**
 * What the owner's mode asks of Core (#1966). The rest of a mode is the
 * stylesheet's (`settings/modes.ts`).
 */
export type Rules = {
  readonly signs: MusicSigns
  /**
   * Where autoplay may go from a whole video: into any video the page
   * admits, or into music only.
   */
  readonly fromMusic: "admitted" | "music"
  /**
   * Whether a plated watch page offers the face control, and when a full
   * hold shows the thumbnail: let go, or still held (QD13).
   */
  readonly face: "none" | FaceWhen
  /**
   * A row of a music Mix's playlist with no date: held, as any card
   * without one is (QD3), or shown on its plate (Music mix).
   */
  readonly undated: "held" | "mix"
}

/**
 * What autoplay does when it would go on into a video Core does not
 * admit: stop there, or skip to the first video in Up next it admits.
 */
export type AutoplayRule = "stop" | "skip"

/** Standard's rules, and every Core's until the shell supplies others. */
export const STANDARD_RULES: Rules = {
  signs: "all",
  fromMusic: "admitted",
  face: "release",
  undated: "held",
}

export type CoreState = {
  readonly phase: Phase
  readonly session: SessionId
  readonly cards: ReadonlyMap<CardKey, CardState>
  /** Null when no watch page or Short is shown. */
  readonly watch: WatchState | null
  /**
   * Every date run a watch page has shown as a video's own, and whose. The
   * page keeps them when it hides, and shows them, or some of them, under
   * the next video until it rewrites them (R8).
   */
  readonly watchDates: WatchDates | null
  /** The owner's `B`, in days, as the shell last supplied it. */
  readonly boundaryDays: number
  /** The owner's mode, as the shell last supplied it. */
  readonly rules: Rules
  /** The owner's autoplay choice, as the shell last supplied it. */
  readonly autoplay: AutoplayRule
  /** B4's staleness signal, per session: how often the table had no answer. */
  readonly unknownShapes: Readonly<Record<UnknownShapeReason, number>>
  /**
   * The videos this tab's watch page has shown since `start`, newest last,
   * at most {@link PLAYED_KEPT}: Skip never goes back to one (R10).
   */
  readonly played: ReadonlyArray<VideoId>
  /**
   * The Mixes (`RD…`) known to be music: each has played a video whole in
   * the lane (QD15) since `start` (R11).
   */
  readonly musicMixes: ReadonlyArray<string>
  /**
   * Where autoplay, or Skip, last went on to, and from which video, until
   * the watch page shows that video decided or shows another one (SK1).
   */
  readonly arriving: Arrival | null
  /**
   * The held page Skip is to move on from and has found nowhere to go yet
   * (SK1). Read it through {@link isStranded}, which also asks whether that
   * page is still the one shown, still held, and Skip still the choice.
   */
  readonly stranded: VideoId | null
}

/** An autoplay on its way from the page's video to the next one. */
export type Arrival = {
  readonly from: VideoId | null
  readonly to: VideoId
}

/**
 * How many played videos Skip remembers. A filter for where autoplay goes
 * next, not a record: past this, the oldest are let go.
 */
export const PLAYED_KEPT = 200

export const EMPTY_UNKNOWN_SHAPES: CoreState["unknownShapes"] = {
  "surface-uncrawled": 0,
  "tag-unseen": 0,
  "nested-without-outer": 0,
  "unexpected-outer": 0,
}

/** The state before any session — what `start` folds over. */
export function initialState(session: SessionId): CoreState {
  return {
    phase: "idle",
    session,
    cards: new Map(),
    watch: null,
    watchDates: null,
    boundaryDays: DEFAULT_BOUNDARY_DAYS,
    rules: STANDARD_RULES,
    autoplay: "stop",
    unknownShapes: EMPTY_UNKNOWN_SHAPES,
    played: [],
    musicMixes: [],
    arriving: null,
    stranded: null,
  }
}

/**
 * A JSON-safe view of the state, for the diagnostics page and for the
 * replay-determinism test. A `Map` is not JSON, so cards are listed.
 */
export type CoreSnapshot = {
  readonly phase: Phase
  readonly session: number
  readonly cards: ReadonlyArray<CardState>
  readonly watch: WatchState | null
  readonly watchDates: WatchDates | null
  readonly boundaryDays: number
  readonly rules: Rules
  readonly autoplay: AutoplayRule
  readonly unknownShapes: CoreState["unknownShapes"]
  readonly played: ReadonlyArray<VideoId>
  readonly musicMixes: ReadonlyArray<string>
  readonly arriving: Arrival | null
  readonly stranded: VideoId | null
}

/**
 * Whether Core admits `videoId` where autoplay would go next (#1805): a
 * card for it is on the page, plated or whole in the lane. A held card, or a
 * video with no card at all, is not admitted (QD3, QD11). From a whole
 * video, a mode that keeps autoplay in the lane admits only another whole
 * one (#1966).
 */
export function admits(state: CoreState, videoId: VideoId): boolean {
  const lane =
    state.rules.fromMusic === "music" && state.watch?.view === "whole"
  for (const card of state.cards.values()) {
    if (card.observation.videoId !== videoId) continue
    if (lane ? card.view.kind === "whole" : admitted(card.view.kind)) {
      return true
    }
  }
  return false
}

/**
 * Where autoplay goes instead of a video Core does not admit, under Skip
 * (#1966): the first of `upNext`, in the Sensor's order, that Core admits,
 * is not the page's own video and has not played in this tab. None in the
 * miniplayer, which plays over another page, nor when there is no such
 * video: autoplay stops.
 */
export function skipTo(
  state: CoreState,
  upNext: ReadonlyArray<VideoId>
): VideoId | null {
  const watch = state.watch
  if (state.autoplay !== "skip" || watch === null) return null
  if (watch.observation.miniplayer) return null
  const own = watch.observation.videoId
  return (
    upNext.find(
      (id) => id !== own && !state.played.includes(id) && admits(state, id)
    ) ?? null
  )
}

/**
 * SK1: whether Skip still has to move on from the page shown: the page it
 * was stranded on, shown outside the miniplayer and still held, with Skip
 * still the owner's choice. A later reading, a new mode or boundary, or a
 * change of autoplay can each end it without touching `stranded`.
 */
export function isStranded(state: CoreState): boolean {
  const watch = state.watch
  return (
    state.stranded !== null &&
    state.autoplay === "skip" &&
    watch !== null &&
    watch.view === "absent" &&
    !watch.observation.miniplayer &&
    watch.observation.videoId === state.stranded
  )
}

/**
 * Whether a card with no date is shown on its plate rather than held: only
 * under Music mix, and only a row of a Mix known to be music.
 */
export function undatedShown(
  state: Pick<CoreState, "musicMixes">,
  rules: Rules,
  observation: Observation
): boolean {
  return (
    rules.undated === "mix" &&
    observation.mix !== null &&
    state.musicMixes.includes(observation.mix)
  )
}

export function snapshot(state: CoreState): CoreSnapshot {
  return {
    phase: state.phase,
    session: state.session,
    cards: [...state.cards.values()],
    watch: state.watch,
    watchDates: state.watchDates,
    boundaryDays: state.boundaryDays,
    rules: state.rules,
    autoplay: state.autoplay,
    unknownShapes: state.unknownShapes,
    played: state.played,
    musicMixes: state.musicMixes,
    arriving: state.arriving,
    stranded: state.stranded,
  }
}
