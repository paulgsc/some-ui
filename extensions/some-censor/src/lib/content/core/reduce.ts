/**
 * The Core reducer (BC3): `reduce(state, event) → { state, actions }`.
 *
 * Pure and total. Every branch below is a function of the state it is given
 * and the event it is handed — no clock, no randomness, no session counter,
 * no DOM, no browser call (Boundary Contract B6, B8). What a card shows is
 * `fsm.ts`'s `decide`, over the card's evidence and the event's `t`; this
 * module is the orchestration, as data in, data out.
 *
 * Design properties, pinned by `core.test.ts` (labels for citation, not
 * declared review invariants):
 *
 *   R1 — Phase gate. Nothing but `start` does anything while idle (M1).
 *   R2 — One card per artifact. `observed` for a key already held folds the
 *        observation and re-renders; it never creates a second card (M2).
 *   R3 — Navigation is total. `nav` unmounts and forgets every card and
 *        adopts the shell's new session; nothing survives it (C2, M3, F1).
 *   R5 — Every observation renders. The Actuator's idempotence is what
 *        makes that cheap, and it is what keeps "what Core believes" and
 *        "what the page shows" from drifting.
 *   R6 — Unknown shape is a state (B4). A card the table could not place is
 *        still a card, decided like every other; each `unknown-shape` token
 *        (one per element the Sensor could not place) is counted.
 *   R7 — Evidence under the boundary. A card's view is `decide()` of its
 *        merged observation at the `t` it was last observed, under the
 *        state's boundary and music signs: a re-observation that moves the
 *        estimate moves the view (#1803), and so do the owner's `boundary`
 *        and `rules`, re-deciding every card in place in one step (#1807,
 *        #1966). No other input changes it.
 *   R8 — The watch page is one more piece of evidence (#1805). Its view is
 *        `decideWatch()` of the merged `watched` observations of the same
 *        video, re-decided by `boundary` and `rules` as a card is. YouTube
 *        names the next video before it rewrites the date, so a reading
 *        whose runs are all runs the previous video showed is that video's,
 *        and reads as none. (Not covered: a start mid-transition, with no previous
 *        video read; and a date written before its video's id, which would
 *        hold the next video pending.) It is not a card: `nav` leaves it to the next reading, and
 *        `stop` forgets it, the Actuator's `dispose` lifting its hold. A
 *        `watch` action is emitted when its view, its video, where it plays
 *        or its face changes, when the mode offers, withdraws or changes the face
 *        control, and again on `described`, when the page's description
 *        was drawn again.
 *   R9 — The face is one view's (QD13). A `face` input for the plated page's
 *        video, outside the miniplayer, shows its real thumbnail, unless
 *        the mode offers no face control; one with `shown: false` hides it
 *        again, only where the mode lets it (`held`). A new video, a view
 *        that is no longer plated, a mode without the control, and `nav`
 *        take it away. Nothing keeps it.
 *  R10 — Skip goes only where Core admits (#1966). A `held` token yields a
 *        `play` for the first Up next video `skipTo` names, and nothing
 *        when the owner's choice is to stop or no such video is shown.
 *        Skip never goes back to a video the tab's watch page has shown
 *        since `start` (`played`), so it cannot walk a loop of a few
 *        videos that each name the other first (SK1). `played` is the tab's,
 *        not the page's: `nav` keeps it, and only `start` empties it.
 *        And a page autoplay or Skip went on into that turns out held
 *        (admitted by its card, held by its own date) yields `skip`, so
 *        Skip moves on rather than stopping at "Not here."; until a `held`
 *        finds somewhere to go, `stranded` names that page.
 *  R11 — Under Music mix, any Mix counts as music (owner, 2026-10-31): a
 *        row of a Mix's playlist (`list=RD…`) with no date is plated (QD3's
 *        amendment), from the first reading, whatever has played. Nothing
 *        remembers a Mix, so a card's view needs only its own evidence and
 *        the mode; every other mode holds the row.
 *  R12 — The course follows every step (`course/course.ts`). After each
 *        event, the marks of the watch page's playlist are worked out again
 *        from the rows the Sensor last read (`queued`), each row's view, the
 *        page's own video, the mode and the autoplay choice; a `course`
 *        action is emitted only when the rows or a mark changed. It decides
 *        nothing: no card's view, nor where autoplay goes. `nav` and `stop`
 *        empty the rows, so the marks go with the cards.
 *  R13 — A stop the course did not foresee is told. A `held` that finds
 *        nowhere to go, on a page whose row the course had not marked a
 *        stop, and a page autoplay went on into that turns out held where
 *        Skip does not move on (SK1), mark `unforeseen` at the page's
 *        video; a `stopped` action says so. A `play`, another video on the
 *        page, no page, and `stop` end it, with `stopped: false`. Nothing
 *        else reads it.
 *
 * R4 correlated the answers to Core's async requests; none are left, so it
 * is retired. The parenthesised M- and C- labels are kept so their
 * citations resolve: M1, M2 and M3 are R1, R2 and R3 as stated, and C1–C4
 * are `controller.ts`'s.
 */

import type { RowMark } from "@censor/lib/content/course/course"
import { courseOf } from "@censor/lib/content/course/course"
import type { WatchView } from "@censor/lib/content/fsm"
import { decide, decideWatch, project } from "@censor/lib/content/fsm"
import { plateOf } from "@censor/lib/content/plate/plate"
import type { VideoId } from "@censor/types/ids"
import { assertNever } from "@some-extension/common"

import type { Action, CoreFact } from "./actions"
import type { CoreEvent } from "./events"
import type { CardKey } from "./keys"
import { cardKey, keyVideoId } from "./keys"
import type { Observation, WatchObservation } from "./observation"
import { mergeObservation, mergeWatch } from "./observation"
import type {
  Arrival,
  CardState,
  CoreState,
  Course,
  Rules,
  WatchState,
} from "./state"
import {
  EMPTY_UNKNOWN_SHAPES,
  foreseen,
  NO_COURSE,
  PLAYED_KEPT,
  sameRows,
  skipTo,
  undatedShown,
} from "./state"

export type Step = {
  readonly state: CoreState
  readonly actions: ReadonlyArray<Action>
}

const none = (state: CoreState): Step => ({ state, actions: [] })

const record = (fact: CoreFact): Action => ({ kind: "record", fact })

function withCards(
  state: CoreState,
  cards: ReadonlyMap<CardKey, CardState>
): CoreState {
  return { ...state, cards }
}

function setCard(state: CoreState, card: CardState): CoreState {
  const cards = new Map(state.cards)
  cards.set(card.key, card)
  return withCards(state, cards)
}

function deleteCard(state: CoreState, key: CardKey): CoreState {
  const cards = new Map(state.cards)
  cards.delete(key)
  return withCards(state, cards)
}

/** The render for a card's current view. */
function render(card: CardState): Action {
  return {
    kind: "render",
    key: card.key,
    model: project(card.view, card.observation),
  }
}

function stateFact(card: CardState): Action {
  return record({
    kind: "entry.state",
    videoId: keyVideoId(card.key),
    state: card.view.kind,
  })
}

/** Unmount and forget every card. */
function clearCards(state: CoreState): Step {
  const actions: Array<Action> = []
  for (const key of state.cards.keys()) actions.push({ kind: "unmount", key })
  return { state: withCards(state, new Map()), actions }
}

export function reduce(state: CoreState, event: CoreEvent): Step {
  return withNotice(state, withCourse(fold(state, event)))
}

function fold(state: CoreState, event: CoreEvent): Step {
  const { kind } = event
  switch (kind) {
    // ── Lifecycle ──────────────────────────────────────────────────────────
    case "start": {
      if (state.phase === "running") return none(state)
      return {
        state: {
          ...state,
          phase: "running",
          session: event.session,
          cards: new Map(),
          watch: null,
          watchDates: null,
          boundaryDays: event.boundaryDays,
          rules: event.rules,
          autoplay: event.autoplay,
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
          played: [],
          arriving: null,
          stranded: null,
          queue: [],
          course: NO_COURSE,
          unforeseen: null,
        },
        actions: [record({ kind: "session.start", session: event.session })],
      }
    }

    case "stop": {
      if (state.phase !== "running") return none(state)
      const cleared = clearCards(state)
      return {
        state: { ...cleared.state, phase: "idle", watch: null, queue: [] },
        actions: [
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
        ],
      }
    }

    case "nav": {
      if (state.phase !== "running") return none(state)
      const cleared = clearCards(state)
      // R9: a navigation is a new view, so the face goes with it.
      const faced = state.watch?.face === true
      const watch =
        state.watch === null ? null : { ...state.watch, face: false }
      return {
        state: {
          ...cleared.state,
          session: event.session,
          watch,
          queue: [],
          unknownShapes: EMPTY_UNKNOWN_SHAPES,
        },
        actions: [
          record({ kind: "navigation" }),
          record({ kind: "session.reset", session: state.session }),
          ...cleared.actions,
          ...(faced ? [watchAction(watch, state.rules)] : []),
          record({ kind: "session.start", session: event.session }),
        ],
      }
    }

    case "face": {
      if (state.phase !== "running") return none(state)
      const watch = state.watch
      if (
        state.rules.face === "none" ||
        (!event.shown && state.rules.face !== "held") ||
        watch?.view !== "plated" ||
        watch.face === event.shown ||
        watch.observation.miniplayer ||
        watch.observation.videoId !== event.videoId
      ) {
        return none(state)
      }
      const next = { ...watch, face: event.shown }
      return {
        state: { ...state, watch: next },
        actions: [watchAction(next, state.rules)],
      }
    }

    case "boundary": {
      if (state.phase !== "running") return none(state)
      return redecide(state, event.days, state.rules)
    }

    case "rules": {
      if (state.phase !== "running") return none(state)
      return redecide(state, state.boundaryDays, event.rules)
    }

    case "autoplay": {
      if (state.phase !== "running") return none(state)
      return none({ ...state, autoplay: event.autoplay })
    }

    // ── Tokens ─────────────────────────────────────────────────────────────
    case "observed": {
      if (state.phase !== "running") return none(state)
      const existing = state.cards.get(event.key)
      if (existing === undefined)
        return adopt(state, event.key, event.observation, event.t)
      return reobserve(state, existing, event.observation, event.t)
    }

    case "gone": {
      if (state.phase !== "running") return none(state)
      if (!state.cards.has(event.key)) return none(state)
      return {
        state: deleteCard(state, event.key),
        actions: [{ kind: "unmount", key: event.key }],
      }
    }

    case "watched": {
      if (state.phase !== "running") return none(state)
      return watched(state, event.watch, event.t)
    }

    case "queued": {
      if (state.phase !== "running") return none(state)
      return none({ ...state, queue: event.rows })
    }

    case "autoplayed": {
      if (state.phase !== "running") return none(state)
      return none({ ...state, arriving: arrival(state, event.videoId) })
    }

    case "held": {
      if (state.phase !== "running") return none(state)
      const to = skipTo(state, event.upNext)
      if (to === null) {
        // R13
        if (foreseen(state) || state.unforeseen !== null) return none(state)
        return none({
          ...state,
          unforeseen: { at: state.watch?.observation.videoId ?? null },
        })
      }
      return {
        state: {
          ...state,
          arriving: arrival(state, to),
          stranded: null,
          unforeseen: null,
        },
        actions: [{ kind: "play", key: cardKey(to) }],
      }
    }

    case "described": {
      if (state.phase !== "running" || state.watch === null) return none(state)
      return { state, actions: [watchAction(state.watch, state.rules)] }
    }

    case "unknown-shape": {
      if (state.phase !== "running") return none(state)
      return {
        state: {
          ...state,
          unknownShapes: {
            ...state.unknownShapes,
            [event.reason]: state.unknownShapes[event.reason] + 1,
          },
        },
        actions: [
          record({
            kind: "shape.unknown",
            tag: event.tag,
            surface: event.surface,
            reason: event.reason,
            shape: "unknown",
          }),
        ],
      }
    }

    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** R12: the playlist's marks as `state` has them now. */
function courseNow(state: CoreState): Course {
  const watch = state.watch
  if (state.phase !== "running" || state.queue.length === 0) return NO_COURSE
  const own =
    watch === null || watch.observation.miniplayer
      ? null
      : watch.observation.videoId
  const marks = courseOf({
    rows: state.queue,
    own,
    ownWhole: watch?.view === "whole",
    view: (videoId) => state.cards.get(cardKey(videoId))?.view.kind ?? null,
    fromMusic: state.rules.fromMusic,
    autoplay: state.autoplay,
    played: state.played,
  })
  return { rows: state.queue, marks }
}

const sameMark = (a: RowMark | null, b: RowMark | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.place === b.place && a.stop === b.stop)

function sameCourse(a: Course, b: Course): boolean {
  return (
    sameRows(a.rows, b.rows) &&
    a.marks.every((mark, i) => sameMark(mark, b.marks[i] ?? null))
  )
}

/**
 * R13: end `unforeseen` once the page shows another video, or none, and
 * tell the shell when it starts or ends.
 */
function withNotice(before: CoreState, step: Step): Step {
  const s = step.state
  const own = s.phase === "running" ? s.watch?.observation.videoId : undefined
  const unforeseen =
    s.unforeseen === null || own === undefined || own !== s.unforeseen.at
      ? null
      : s.unforeseen
  const was = before.unforeseen !== null
  const now = unforeseen !== null
  const state = unforeseen === s.unforeseen ? s : { ...s, unforeseen }
  if (was === now) return state === s ? step : { ...step, state }
  return {
    state,
    actions: [...step.actions, { kind: "stopped", stopped: now }],
  }
}

/** R12: append the course to a step when it moved. */
function withCourse(step: Step): Step {
  const course = courseNow(step.state)
  if (sameCourse(course, step.state.course)) return step
  return {
    state: { ...step.state, course },
    actions: [
      ...step.actions,
      { kind: "course", rows: course.rows, marks: course.marks },
    ],
  }
}

function adopt(
  state: CoreState,
  key: CardKey,
  observation: Observation,
  t: number
): Step {
  const card: CardState = {
    key,
    observation,
    view: decide(
      observation,
      t,
      state.boundaryDays,
      state.rules.signs,
      undatedShown(state.rules, observation),
      state.session
    ),
    firstSeenAt: t,
    lastSeenAt: t,
  }
  const videoId = keyVideoId(key)
  return {
    state: setCard(state, card),
    actions: [
      render(card),
      record(
        observation.channelId === null
          ? { kind: "mount.provisional", videoId }
          : { kind: "mount.resolved", videoId }
      ),
      stateFact(card),
      record({
        kind: "date.observed",
        raw: observation.uploadDate,
        surface: observation.surface,
        renderer: observation.renderer,
      }),
    ],
  }
}

function reobserve(
  state: CoreState,
  card: CardState,
  observation: Observation,
  t: number
): Step {
  const merged = mergeObservation(card.observation, observation)
  const view = decide(
    merged,
    t,
    state.boundaryDays,
    state.rules.signs,
    undatedShown(state.rules, merged),
    state.session
  )
  const next: CardState = { ...card, observation: merged, view, lastSeenAt: t }
  const actions: Array<Action> = []
  const videoId = keyVideoId(card.key)

  // A channel arriving late (or a display-name fallback replaced by the
  // hydrated handle) upgrades a provisional card.
  if (
    merged.channelId !== null &&
    merged.channelId !== card.observation.channelId
  ) {
    actions.push(record({ kind: "channel.backfilled", videoId }))
  }

  // A date arriving late is corpus: YouTube hydrates it after the card, so
  // the adoption-time fact alone would miss most forms. Recorded when a later
  // observation supplies a new or different date, never a repeat.
  if (
    merged.uploadDate !== null &&
    merged.uploadDate !== card.observation.uploadDate
  ) {
    actions.push(
      record({
        kind: "date.observed",
        raw: merged.uploadDate,
        surface: merged.surface,
        renderer: merged.renderer,
      })
    )
  }

  // R5 and R7: re-render on every observation, whether or not the view
  // moved. A re-observed card may have gained or lost elements, and the
  // Actuator re-derives targets.
  actions.push(render(next))
  if (view.kind !== card.view.kind) actions.push(stateFact(next))
  return { state: setCard(state, next), actions }
}

function watchAction(watch: WatchState | null, rules: Rules): Action {
  const videoId = watch?.observation.videoId ?? null
  return {
    kind: "watch",
    view: watch?.view ?? null,
    videoId,
    miniplayer: watch?.observation.miniplayer ?? false,
    poster:
      watch?.view === "plated" && videoId !== null
        ? plateOf({ videoId, channelId: null, channelName: null }).fill
        : null,
    face: watch?.face ?? false,
    offer: rules.face,
  }
}

/** Every run of `dates` is one of `seen`: none of them is new. */
const within = (
  dates: ReadonlyArray<string>,
  seen: ReadonlyArray<string>
): boolean => dates.length > 0 && dates.every((d) => seen.includes(d))

function watched(
  state: CoreState,
  observation: WatchObservation | null,
  t: number
): Step {
  const previous = state.watch
  if (observation === null) {
    return {
      state: { ...state, watch: null },
      actions: previous === null ? [] : [watchAction(null, state.rules)],
    }
  }
  // R8: another video's dates, still on screen, are not this one's.
  const last = state.watchDates
  const stale =
    last !== null &&
    last.videoId !== observation.videoId &&
    within(observation.dates, last.dates)
  // With them, the title and the channel are the previous video's too, so
  // they say nothing about the lane (QD15) yet; nor do they on a reading
  // with no date of this video's own, which may be the previous page.
  const own =
    stale || observation.dates.length === 0
      ? {
          ...observation,
          dates: stale ? [] : observation.dates,
          title: null,
          channelName: null,
          artist: false,
        }
      : observation
  const merged = previous === null ? own : mergeWatch(previous.observation, own)
  const view = decideWatch(merged, t, state.boundaryDays, state.rules.signs)
  const next: WatchState = {
    observation: merged,
    view,
    // R9: the face stays only with the same plated video, outside the
    // miniplayer.
    face:
      previous?.face === true &&
      previous.observation.videoId === merged.videoId &&
      view === "plated" &&
      !merged.miniplayer,
    seenAt: t,
  }
  let watchDates = last
  if (own.dates.length > 0) {
    const seen = last?.videoId === observation.videoId ? last.dates : []
    watchDates = {
      videoId: observation.videoId,
      dates: [...seen, ...own.dates.filter((d) => !seen.includes(d))],
    }
  }
  const moved =
    previous?.view !== next.view ||
    previous.observation.videoId !== merged.videoId ||
    previous.observation.miniplayer !== merged.miniplayer ||
    previous.face !== next.face
  const landed = arrived(state.arriving, merged, view)
  const skip =
    landed === "held" && state.autoplay === "skip" && !merged.miniplayer
  const actions: Array<Action> = moved ? [watchAction(next, state.rules)] : []
  if (skip) actions.push({ kind: "skip" })
  return {
    state: {
      ...state,
      watch: next,
      watchDates,
      played: playedWith(state.played, merged),
      arriving: landed === "on its way" ? state.arriving : null,
      // R13
      unforeseen:
        landed === "held" && !skip ? { at: merged.videoId } : state.unforeseen,
      // Stranded only while that page stays held: later evidence may show it.
      stranded:
        skip || (merged.videoId === state.stranded && view === "absent")
          ? merged.videoId
          : null,
    },
    actions,
  }
}

/** SK1: autoplay is going on from the page's video into `to`. */
function arrival(state: CoreState, to: VideoId): Arrival {
  return { from: state.watch?.observation.videoId ?? null, to }
}

/**
 * SK1: whether the page now shows where autoplay went, and how: still on
 * its way (the old page, or the new one pending), there and held, or
 * settled (shown, or another video altogether).
 */
function arrived(
  arriving: Arrival | null,
  watch: WatchObservation,
  view: WatchView
): "on its way" | "held" | "settled" {
  if (arriving === null) return "settled"
  const id = watch.videoId
  if (id === null || id === arriving.from) return "on its way"
  if (id !== arriving.to) return "settled"
  if (view === "pending") return "on its way"
  return view === "absent" ? "held" : "settled"
}

/** R10: the watch page's video, once, at the end of what Skip remembers. */
function playedWith(
  played: ReadonlyArray<VideoId>,
  watch: WatchObservation
): ReadonlyArray<VideoId> {
  const id = watch.miniplayer ? null : watch.videoId
  if (id === null || played.at(-1) === id) return played
  return [...played.filter((p) => p !== id), id].slice(-PLAYED_KEPT)
}

/**
 * Re-decide every card, and the watch page, under a new boundary or mode.
 * Only a card whose view moved is re-rendered, and each goes straight from
 * one stamp to the other, so no card passes through unstamped. The watch
 * page is rendered again when its view moved or the face control comes,
 * goes or changes with the mode.
 */
function redecide(state: CoreState, boundaryDays: number, rules: Rules): Step {
  const actions: Array<Action> = []
  let watch = state.watch
  if (watch !== null) {
    const view = decideWatch(
      watch.observation,
      watch.seenAt,
      boundaryDays,
      rules.signs
    )
    if (view !== watch.view || rules.face !== state.rules.face) {
      watch = {
        ...watch,
        view,
        face: watch.face && view === "plated" && rules.face !== "none",
      }
      actions.push(watchAction(watch, rules))
    }
  }
  const cards = new Map<CardKey, CardState>()
  for (const card of state.cards.values()) {
    const view = decide(
      card.observation,
      card.lastSeenAt,
      boundaryDays,
      rules.signs,
      undatedShown(rules, card.observation),
      state.session
    )
    const next: CardState = { ...card, view }
    cards.set(card.key, next)
    if (view.kind !== card.view.kind)
      actions.push(render(next), stateFact(next))
  }
  return {
    state: { ...state, boundaryDays, rules, cards, watch },
    actions,
  }
}
