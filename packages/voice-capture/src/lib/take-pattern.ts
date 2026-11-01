/**
 * The take pattern: record, see where it's kept, hear it,
 * redo it, let it go, the same on every screen. The first entry of the
 * pattern tier (docs/monorepo-boundaries.md, "Patterns: whole flows, one
 * closed set of options"): a pure step and a runtime here, its words in
 * `./take-words`, what a screen shows in `./take-view`, and its parts (the
 * take button, row and list) in `@some-ui/shared`.
 *
 * - `TakePatternOptions` is the only way a screen may make it differ. A need
 *   outside it becomes a new option here, added with the case it serves,
 *   never a part drawn by the screen.
 * - `stepTakePattern` embeds the take kit's step (`./take-kit`), so a take
 *   is started, stopped and ended exactly as the kit does it (D1, VC2, VC3),
 *   and adds what the row does: play one take at a time, Redo (D2) and Let
 *   go (D3).
 * - `takePattern(ports, options)` runs it: the microphone through
 *   `takeRunner`, a take's audio through the screen's `audio` port and the
 *   kit's `Player`, and the screen's own store through `keep` and
 *   `setAside`.
 *
 * Decided by the owner (2026-10-31, epic #2368):
 * - D1, tap to start and tap to stop, on every screen;
 * - D2, Redo supersedes: a kept redo becomes the item's take, and the
 *   earlier one leaves the item's view but is kept (`keep`'s `supersedes`,
 *   one write in the screen's store);
 * - D3, Let go sets a take aside: out of the item and out of what routines
 *   read, kept (on home once home holds it; on the phone until then). It is
 *   never permanent, so it asks nothing first.
 *
 * Playing and recording never overlap: a tap that starts a take stops what
 * plays, and Play does nothing while a take is under way.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Player } from "./player"
import { audioPlayer } from "./player"
import type { RecordingFailure, Take } from "./recorder"
import type { TakeLimits, TakeSignal } from "./take"
import { takeRunner } from "./take"
import type {
  KeepResult,
  TakeEnded,
  TakeKitEffect,
  TakeKitPorts,
  TakeKitState,
  TakeKitView,
} from "./take-kit"
import { initialTakeKit, stepTakeKit, takeKitView, TICK_MS } from "./take-kit"

/** One current take per item, or many beside each other, up to `max`. */
export type TakesPerItem =
  | { readonly per: "one" }
  | { readonly per: "many"; readonly max: number }

/**
 * The pattern's options: the closed set a screen picks from, as a shadcn
 * component takes its `cva` variants.
 */
export type TakePatternOptions = {
  readonly takes: TakesPerItem
  /** The longest take (the cap) and the shortest one kept. */
  readonly limits: TakeLimits
  /** D2: the new take becomes the item's take; the earlier one is kept. */
  readonly redo: "supersede"
  /** D3: out of the item and what routines read, kept. */
  readonly letGo: "set-aside"
  /** Play on every take listed, or only on the newest. */
  readonly play: "each" | "latest"
}

/**
 * One current take an item, each played on its own, at least a second and
 * at most a minute: what the phone's screens on the pattern choose. A screen
 * with limits of its own spreads it and sets `limits`.
 */
export const ONE_TAKE: TakePatternOptions = {
  takes: { per: "one" },
  limits: { minMs: 1_000, maxMs: 60_000 },
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
}

/**
 * Where a take is kept, in the person's terms (`./take-words`): on this
 * phone alone, on this phone and waiting to go home, or on home.
 */
export type TakePlace = "phone" | "going" | "home"

/**
 * Where a take is kept, and since when (MIC3), as its screen's store reads
 * it from what home has told this phone. A kind of take that goes home
 * nowhere stays `phone`: nothing here says it will go.
 */
export type TakeKept =
  /** On this phone alone. */
  | { readonly place: "phone" }
  /** On this phone, its copy waiting to go home. */
  | { readonly place: "going" }
  | {
      readonly place: "home"
      /**
       * When this phone heard home say it holds the take, as an ISO time;
       * null when it heard before it noted when.
       */
      readonly since: string | null
    }

/** A take on this phone alone: where every take starts. */
export const ON_PHONE: TakeKept = { place: "phone" }

/** Where a take stands in its item: its take, an earlier one (D2), or set aside (D3). */
export type TakeStanding = "current" | "earlier" | "set-aside"

/** A take as the pattern lists it: what a screen's store hands the parts. */
export type PatternTake = {
  readonly id: string
  /** The item it answers: what `tap` was given. */
  readonly answers: string
  readonly durationMs: number
  /** When it was recorded, as an ISO time; newest first in a list. */
  readonly recordedAt: string
  readonly standing: TakeStanding
  readonly kept: TakeKept
}

/** What plays: nothing, a take whose audio is being read, or a take playing. */
export type PatternPlayback =
  | { readonly kind: "quiet" }
  | { readonly kind: "loading"; readonly id: string }
  | { readonly kind: "playing"; readonly id: string }

export type TakePatternState = {
  readonly kit: TakeKitState
  /** The take the one under way would supersede if kept (D2). */
  readonly supersedes: string | null
  readonly playback: PatternPlayback
  /** Counts plays, so a late answer for an earlier one is for nobody. */
  readonly plays: number
  /** The take whose audio couldn't be read, until the next play or take. */
  readonly unplayable: string | null
  /** The take last set aside, and where it is kept, until the next play or take. */
  readonly setAside: {
    readonly id: string
    readonly place: TakePlace
  } | null
}

export const initialTakePattern: TakePatternState = {
  kit: initialTakeKit,
  supersedes: null,
  playback: { kind: "quiet" },
  plays: 0,
  unplayable: null,
  setAside: null,
}

export type TakePatternEvent =
  /**
   * D1's gesture: starts a take answering `answers` (superseding
   * `supersedes` once kept, D2), or stops the one under way.
   */
  | {
      readonly type: "tap"
      readonly answers: string
      readonly supersedes: string | null
    }
  /** Plays a take, or stops it when it is the one playing. */
  | { readonly type: "play"; readonly id: string }
  | { readonly type: "stopPlaying" }
  /** D3: sets a take aside. */
  | { readonly type: "letGo"; readonly id: string; readonly place: TakePlace }
  /** The screen went: a take under way is kept, and nothing plays. */
  | { readonly type: "left" }
  | {
      readonly type: "loaded"
      readonly play: number
      readonly audio: Blob | null
    }
  | { readonly type: "played"; readonly play: number }
  | TakeSignal
  | { readonly type: "kept"; readonly result: KeepResult }

export type TakePatternEffect =
  | Exclude<TakeKitEffect, { type: "keep" }>
  | {
      readonly type: "keep"
      readonly take: Take
      readonly answers: string
      readonly supersedes: string | null
    }
  | { readonly type: "setAside"; readonly id: string }
  | { readonly type: "loadAudio"; readonly id: string; readonly play: number }
  | { readonly type: "playAudio"; readonly audio: Blob; readonly play: number }
  | { readonly type: "stopAudio" }

type Next = {
  readonly state: TakePatternState
  readonly effects: ReadonlyArray<TakePatternEffect>
}

/** A take is under way from its start until its ending. */
function underway(kit: TakeKitState, limits: TakeLimits): boolean {
  return takeKitView(kit, limits).kind !== "idle"
}

/** Stops what plays: a playing take's audio, or a read still under way. */
function quieted(state: TakePatternState): Next {
  const { playback } = state
  if (playback.kind === "quiet") return { state, effects: [] }
  return {
    state: { ...state, playback: { kind: "quiet" } },
    effects: playback.kind === "playing" ? [{ type: "stopAudio" }] : [],
  }
}

/** The kit's step, with `keep` carrying what the take supersedes. */
function withKit(
  state: TakePatternState,
  event: Parameters<typeof stepTakeKit>[1],
  options: TakePatternOptions
): Next {
  const next = stepTakeKit(state.kit, event, options.limits)
  const effects = next.effects.map(
    (effect): TakePatternEffect =>
      effect.type === "keep"
        ? { ...effect, supersedes: state.supersedes }
        : effect
  )
  // A take that ended, kept or not, supersedes nothing further, and a tap
  // that started nothing supersedes nothing at all.
  const ended = next.state.ended !== state.kit.ended
  const supersedes =
    !ended && underway(next.state, options.limits) ? state.supersedes : null
  if (next.state === state.kit && supersedes === state.supersedes) {
    return { state, effects }
  }
  return { state: { ...state, kit: next.state, supersedes }, effects }
}

export function stepTakePattern(
  state: TakePatternState,
  event: TakePatternEvent,
  options: TakePatternOptions
): Next {
  const busy = underway(state.kit, options.limits)
  switch (event.type) {
    case "tap": {
      if (busy) return withKit(state, event, options)
      const quiet = quieted(state)
      const started = withKit(
        {
          ...quiet.state,
          supersedes: event.supersedes,
          unplayable: null,
          setAside: null,
        },
        event,
        options
      )
      return {
        state: started.state,
        effects: [...quiet.effects, ...started.effects],
      }
    }
    case "left": {
      const quiet = quieted(state)
      const left = withKit(quiet.state, event, options)
      return { state: left.state, effects: [...quiet.effects, ...left.effects] }
    }
    case "play": {
      if (busy) return { state, effects: [] }
      const { playback } = state
      if (playback.kind !== "quiet" && playback.id === event.id) {
        return quieted(state)
      }
      const quiet = quieted(state)
      const play = state.plays + 1
      return {
        state: {
          ...quiet.state,
          playback: { kind: "loading", id: event.id },
          plays: play,
          unplayable: null,
          setAside: null,
        },
        effects: [...quiet.effects, { type: "loadAudio", id: event.id, play }],
      }
    }
    case "stopPlaying": {
      return quieted(state)
    }
    case "loaded": {
      const { playback } = state
      if (playback.kind !== "loading" || event.play !== state.plays) {
        return { state, effects: [] }
      }
      if (event.audio === null) {
        return {
          state: {
            ...state,
            playback: { kind: "quiet" },
            unplayable: playback.id,
          },
          effects: [],
        }
      }
      return {
        state: { ...state, playback: { kind: "playing", id: playback.id } },
        effects: [{ type: "playAudio", audio: event.audio, play: event.play }],
      }
    }
    case "played": {
      if (state.playback.kind !== "playing" || event.play !== state.plays) {
        return { state, effects: [] }
      }
      return { state: { ...state, playback: { kind: "quiet" } }, effects: [] }
    }
    case "letGo": {
      // The row's actions wait while a take is under way.
      if (busy) return { state, effects: [] }
      const { playback } = state
      const quiet =
        playback.kind !== "quiet" && playback.id === event.id
          ? quieted(state)
          : { state, effects: [] }
      return {
        state: {
          ...quiet.state,
          unplayable: null,
          setAside: { id: event.id, place: event.place },
        },
        effects: [...quiet.effects, { type: "setAside", id: event.id }],
      }
    }
    case "micOpened":
    case "micFailed":
    case "ticked":
    case "taken":
    case "takeFailed":
    case "kept": {
      return withKit(state, event, options)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** What the parts read: the kit's take, its last ending, and what plays. */
export type TakePatternSnapshot = {
  readonly take: TakeKitView
  /** What the take under way answers; null while none is. */
  readonly answers: string | null
  /** The take the one under way would supersede if kept. */
  readonly supersedes: string | null
  /** The last take to end, kept until the next one ends. */
  readonly ended: TakeEnded | null
  /** Why the microphone refuses, while it does. */
  readonly blocked: RecordingFailure | null
  readonly playback: PatternPlayback
  readonly unplayable: string | null
  readonly setAside: TakePatternState["setAside"]
}

export function takePatternSnapshot(
  state: TakePatternState,
  options: TakePatternOptions
): TakePatternSnapshot {
  const take = takeKitView(state.kit, options.limits)
  const { note } = state.kit
  return {
    take,
    answers: take.kind === "idle" ? null : state.kit.answers,
    supersedes: state.supersedes,
    ended: state.kit.ended,
    blocked: note.kind === "blocked" ? note.reason : null,
    playback: state.playback,
    unplayable: state.unplayable,
    setAside: state.setAside,
  }
}

export type TakePattern = {
  readonly options: TakePatternOptions
  /** The same object while nothing changed. */
  readonly getSnapshot: () => TakePatternSnapshot
  readonly subscribe: (listener: () => void) => () => void
  /**
   * D1: starts a take answering `answers`, superseding `supersedes` once
   * kept (D2), or stops the take under way.
   */
  readonly tap: (answers: string, supersedes?: string | null) => void
  /** Plays a take, or stops it when it is the one playing. */
  readonly play: (id: string) => void
  readonly stopPlaying: () => void
  /** D3: sets a take aside; `place` is where it is kept, for the words. */
  readonly letGo: (id: string, place: TakePlace) => void
  /** The screen went: a take under way is kept, and nothing plays. */
  readonly leave: () => void
}

export type TakePatternPorts = Omit<TakeKitPorts, "keep"> & {
  /**
   * Keeps a take's audio under an id of its own, then says how it went,
   * once. When `supersedes` names a take, the new one becomes the item's
   * take and that one an earlier take, in the same write (D2).
   */
  readonly keep: (
    take: Take,
    answers: string,
    supersedes: string | null,
    done: (result: KeepResult) => void
  ) => void
  /** Marks a take set aside (D3): out of the item, kept. */
  readonly setAside: (id: string) => void
  /** A take's audio, or null when it can't be read. */
  readonly audio: (id: string) => Promise<Blob | null>
  /** Defaults to the kit's `audioPlayer`. */
  readonly player?: Player | undefined
}

/**
 * Runs `stepTakePattern` over the ports. It holds the microphone through
 * `takeRunner` and one playback at a time, hands a finished take to `keep`,
 * and decides nothing: which late answer still counts is the step's.
 */
export function takePattern(
  ports: TakePatternPorts,
  options: TakePatternOptions
): TakePattern {
  let state = initialTakePattern
  const listeners = new Set<() => void>()
  let snapshot = takePatternSnapshot(state, options)
  let playback: { readonly stop: () => void } | null = null
  const player = ports.player ?? audioPlayer

  const dispatch = (event: TakePatternEvent): void => {
    const next = stepTakePattern(state, event, options)
    if (next.state !== state) {
      state = next.state
      snapshot = takePatternSnapshot(state, options)
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const runner = takeRunner(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      tickMs: ports.tickMs ?? TICK_MS,
      deadlines: ports.deadlines,
      owner: ports.owner,
    },
    dispatch
  )

  const run = (effect: TakePatternEffect): void => {
    switch (effect.type) {
      case "keep": {
        let answered = false
        ports.keep(effect.take, effect.answers, effect.supersedes, (result) => {
          // Once: a second answer is for nobody.
          if (answered) return
          answered = true
          dispatch({ type: "kept", result })
        })
        return
      }
      case "setAside": {
        ports.setAside(effect.id)
        return
      }
      case "loadAudio": {
        const { play } = effect
        ports.audio(effect.id).then(
          (audio) => dispatch({ type: "loaded", play, audio }),
          () => dispatch({ type: "loaded", play, audio: null })
        )
        return
      }
      case "playAudio": {
        playback?.stop()
        const { play } = effect
        const started = player.play(effect.audio)
        playback = started
        void started.ended.then(() => {
          if (playback === started) playback = null
          dispatch({ type: "played", play })
        })
        return
      }
      case "stopAudio": {
        playback?.stop()
        playback = null
        return
      }
      case "openMic":
      case "startClock":
      case "stopClock":
      case "finishTake":
      case "discardTake": {
        runner.run(effect)
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  return {
    options,
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    tap: (answers, supersedes = null) =>
      dispatch({ type: "tap", answers, supersedes }),
    play: (id) => dispatch({ type: "play", id }),
    stopPlaying: () => dispatch({ type: "stopPlaying" }),
    letGo: (id, place) => dispatch({ type: "letGo", id, place }),
    leave: () => dispatch({ type: "left" }),
  }
}
