/**
 * The soundbites page as one state machine: `step(state, event)` returns the
 * next state and the effects to run, and does nothing else. No React, no
 * microphone, no database, no clock: `runtime.ts` runs the effects against
 * those and feeds their results back in as events, and the component only
 * renders a state and turns taps into events (docs/monorepo-boundaries.md,
 * "Inside a React package: the component is not the coordinator").
 *
 * What used to be rules each async path had to remember is now structure:
 *
 * - **One activity at a time.** Playing, opening the microphone, recording
 *   and saving are arms of one union, so "playing while the microphone
 *   opens" (or while recording) cannot be written down. Pressing record
 *   while playing stops the playback in the same step.
 * - **The list shown is a read that succeeded, or unknown.** `Library` is
 *   `reading`, `unreadable` or `read`; there is no stale list and no zero
 *   that was not read.
 * - **A late result for something superseded is dropped here.** Reads and
 *   plays carry the sequence number of the request that asked for them, and
 *   any result whose number is not the latest is ignored.
 * - **Nothing records while the page is off screen.** A take recording when
 *   the page is hidden is finished and kept; a microphone that opens while
 *   it is hidden is let go; an auto-start that arrives while it is hidden
 *   waits until it is shown. Either order of events ends the same way, and
 *   the runtime reports the page's visibility before it reports arrival.
 * - **A store change from elsewhere is read.** Another instance of this page
 *   (the one left mid-take, still saving) can commit after this one read
 *   the list; the store reports each commit, and the list is re-read.
 * - **The way in is kept until a take is stored.** `source` says how the
 *   person got here and becomes "direct" only on `saved`, so a retry after a
 *   failed save still records the way in.
 *
 * This is our machine, not a mirror of the browser's. `playing` means "we
 * asked to play and have not been told it stopped", `recording` begins only
 * once the recorder has said it started, and nothing here reads
 * `MediaRecorder.state`, `Audio.paused` or IndexedDB's state. Those reach us
 * only as events.
 */
import { formatDuration } from "./format"
import {
  byNewest,
  SOUNDBITE_LIMIT,
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "./policy"
import type { RecordingFailure, Take } from "./recorder"
import type { Soundbite, SoundbiteContext, SoundbiteSource } from "./types"

/** What the app knows when a take is kept, apart from the way in. */
export type SoundbiteSituation = Omit<SoundbiteContext, "source">

type Library =
  | { readonly kind: "reading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "read"; readonly kept: ReadonlyArray<Soundbite> }

export type Activity =
  | { readonly kind: "idle" }
  | { readonly kind: "playing"; readonly id: string; readonly seq: number }
  | { readonly kind: "opening" }
  | {
      readonly kind: "recording"
      readonly startedAt: number
      readonly elapsed: number
      readonly level: number
    }
  | { readonly kind: "saving" }

export type SoundbitesState = {
  /** Whether the page is mounted. A take cut short by leaving is kept. */
  readonly page: "new" | "here" | "left"
  /** Whether the page is on screen. Nothing records while it is not. */
  readonly visible: boolean
  /** An auto-start asked for while the page was hidden, for when it shows. */
  readonly autoStartPending: boolean
  readonly library: Library
  readonly activity: Activity
  /** Why the microphone last refused, until the next try. */
  readonly blocked: RecordingFailure | null
  /** The kept one the person picked to be replaced next, if any. */
  readonly choice: string | null
  readonly notice: string
  readonly source: SoundbiteSource
  /** The latest list read asked for; a result for any other is stale. */
  readonly readSeq: number
  /** The latest play asked for; a result for any other is stale. */
  readonly playSeq: number
  /**
   * Saves and removes this page has asked for and not yet heard back on.
   * Each one re-reads the list when it lands, so a store change seen
   * meanwhile only needs noting (`changedMeanwhile`), not a read of its own.
   */
  readonly writing: number
  readonly changedMeanwhile: boolean
  /** A save's read, which says how many are kept once it lands. */
  readonly keptNote: {
    readonly seq: number
    readonly durationMs: number
  } | null
}

/** What the person does. */
export type SoundbitesIntent =
  | { readonly type: "recordPressed" }
  | { readonly type: "discardPressed" }
  | { readonly type: "playPressed"; readonly id: string }
  | { readonly type: "deleteConfirmed"; readonly id: string }
  | { readonly type: "replacePicked"; readonly id: string }
  | { readonly type: "retryRead" }

/** What the page, the clock and the ports report. */
type SoundbitesSignal =
  | { readonly type: "arrived"; readonly autoStart: boolean }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  /** The store committed a change, possibly from another page instance. */
  | { readonly type: "storeChanged" }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | {
      readonly type: "taken"
      readonly take: Take
      readonly id: string
      readonly at: string
      readonly situation: SoundbiteSituation
    }
  | { readonly type: "takeFailed" }
  | { readonly type: "saved"; readonly bite: Soundbite }
  | { readonly type: "saveFailed" }
  | {
      readonly type: "listed"
      readonly seq: number
      readonly kept: ReadonlyArray<Soundbite>
    }
  | { readonly type: "listFailed"; readonly seq: number }
  | { readonly type: "audioLoaded"; readonly seq: number; readonly audio: Blob }
  | { readonly type: "audioMissing"; readonly seq: number }
  | { readonly type: "audioUnreadable"; readonly seq: number }
  | { readonly type: "playbackEnded"; readonly seq: number }
  | { readonly type: "removed"; readonly id: string }
  | { readonly type: "removeFailed" }

export type SoundbitesEvent = SoundbitesIntent | SoundbitesSignal

export type SoundbitesEffect =
  | { readonly type: "openMic" }
  | { readonly type: "finishTake" }
  | { readonly type: "discardTake" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | {
      readonly type: "save"
      readonly bite: Soundbite
      readonly audio: Blob
      readonly replace: string | null
    }
  | { readonly type: "read"; readonly seq: number }
  | { readonly type: "loadAudio"; readonly id: string; readonly seq: number }
  | {
      readonly type: "startPlayback"
      readonly audio: Blob
      readonly seq: number
    }
  | { readonly type: "stopPlayback" }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "announceAutoStart" }

export type Step = {
  readonly state: SoundbitesState
  readonly effects: ReadonlyArray<SoundbitesEffect>
}

export const NOTICES = {
  tooShort: "Too short to keep. Tap, talk, then tap again.",
  notKept: "That one couldn't be kept. Try again?",
  thrownAway: "Thrown away. Nothing kept.",
  audioMissing: "That recording's audio is missing.",
  notPlayable: "That recording couldn't be played.",
  notDeleted: "That one couldn't be deleted. Try again?",
  notStarted: "The screen went away before the microphone opened. Tap to talk.",
} as const

export function initialState(source: SoundbiteSource): SoundbitesState {
  return {
    page: "new",
    visible: true,
    autoStartPending: false,
    library: { kind: "reading" },
    activity: { kind: "idle" },
    blocked: null,
    choice: null,
    notice: "",
    source,
    readSeq: 0,
    playSeq: 0,
    writing: 0,
    changedMeanwhile: false,
    keptNote: null,
  }
}

/** Whether the list's play and delete controls take a tap. */
export function canUseKept(activity: Activity): boolean {
  return activity.kind === "idle" || activity.kind === "playing"
}

const stay = (state: SoundbitesState): Step => ({ state, effects: [] })

function read(state: SoundbitesState): Step {
  const seq = state.readSeq + 1
  return { state: { ...state, readSeq: seq }, effects: [{ type: "read", seq }] }
}

function startRecording(state: SoundbitesState): Step {
  return {
    state: {
      ...state,
      activity: { kind: "opening" },
      blocked: null,
      notice: "",
    },
    effects: [
      ...(state.activity.kind === "playing"
        ? [{ type: "stopPlayback" } as const]
        : []),
      { type: "openMic" },
    ],
  }
}

function finishRecording(state: SoundbitesState): Step {
  if (state.activity.kind !== "recording") return stay(state)
  return {
    state: { ...state, activity: { kind: "saving" } },
    effects: [{ type: "stopClock" }, { type: "finishTake" }],
  }
}

/**
 * One of this page's writes has landed. A write that changed the store
 * re-reads the list; one that failed re-reads only if the store changed
 * meanwhile (another page instance's save, say).
 */
function writeLanded(state: SoundbitesState, changed: boolean): Step {
  const writing = Math.max(0, state.writing - 1)
  const settled = { ...state, writing }
  if (!changed && !state.changedMeanwhile) return stay(settled)
  if (writing > 0 && !changed) return stay(settled)
  return read({ ...settled, changedMeanwhile: false })
}

/** Whether `seq` is the play the page is still waiting on. */
function isCurrentPlay(state: SoundbitesState, seq: number): boolean {
  return state.activity.kind === "playing" && state.activity.seq === seq
}

function stopPlay(state: SoundbitesState, notice?: string): Step {
  return {
    state: {
      ...state,
      activity: { kind: "idle" },
      notice: notice ?? state.notice,
    },
    effects: [{ type: "stopPlayback" }],
  }
}

export function step(state: SoundbitesState, event: SoundbitesEvent): Step {
  const { activity } = state
  switch (event.type) {
    case "arrived": {
      // Arriving again after leaving is StrictMode's remount, or a return
      // to the page: what was in flight carries on, nothing restarts.
      if (state.page !== "new") return stay({ ...state, page: "here" })
      const here = read({ ...state, page: "here" })
      if (!event.autoStart) return here
      // Arrived off screen (launched in the background, say): listen once
      // the page is shown, not before.
      if (!state.visible)
        return {
          state: { ...here.state, autoStartPending: true },
          effects: here.effects,
        }
      const started = startRecording(here.state)
      return {
        state: started.state,
        effects: [
          ...here.effects,
          { type: "announceAutoStart" },
          ...started.effects,
        ],
      }
    }

    case "left": {
      const gone = { ...state, page: "left" as const }
      if (activity.kind === "recording") return finishRecording(gone)
      if (activity.kind === "playing") return stopPlay(gone)
      return stay(gone)
    }

    case "hidden": {
      return finishRecording({ ...state, visible: false })
    }

    case "shown": {
      const shown = { ...state, visible: true }
      if (!state.autoStartPending || activity.kind !== "idle")
        return stay(shown)
      const started = startRecording({ ...shown, autoStartPending: false })
      return {
        state: started.state,
        effects: [{ type: "announceAutoStart" }, ...started.effects],
      }
    }

    case "storeChanged": {
      // A save or delete committed, maybe by the page instance that was
      // left mid-take: re-read, so a remount does not keep a pre-save list.
      // While a write of ours is out, its landing re-reads anyway.
      if (state.writing > 0) return stay({ ...state, changedMeanwhile: true })
      return state.page === "here" ? read(state) : stay(state)
    }

    case "recordPressed": {
      if (activity.kind === "idle" || activity.kind === "playing")
        return startRecording(state)
      return finishRecording(state)
    }

    case "discardPressed": {
      if (activity.kind !== "recording") return stay(state)
      return {
        state: {
          ...state,
          activity: { kind: "idle" },
          notice: NOTICES.thrownAway,
        },
        effects: [{ type: "stopClock" }, { type: "discardTake" }],
      }
    }

    case "ticked": {
      if (activity.kind !== "recording") return stay(state)
      const ms = event.now - activity.startedAt
      const ticked = {
        ...state,
        activity: {
          ...activity,
          elapsed: Math.min(ms, SOUNDBITE_MAX_MS),
          level: event.level,
        },
      }
      return ms >= SOUNDBITE_MAX_MS ? finishRecording(ticked) : stay(ticked)
    }

    case "micOpened": {
      if (activity.kind !== "opening") return stay(state)
      // Left, or hidden, while the microphone was opening: let it go.
      // Nothing records while the page is off screen.
      if (state.page === "left" || !state.visible)
        return {
          state: {
            ...state,
            activity: { kind: "idle" },
            notice: state.page === "left" ? state.notice : NOTICES.notStarted,
          },
          effects: [{ type: "discardTake" }],
        }
      return {
        state: {
          ...state,
          activity: {
            kind: "recording",
            startedAt: event.at,
            elapsed: 0,
            level: 0,
          },
        },
        effects: [{ type: "startClock" }],
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

    case "taken": {
      if (activity.kind !== "saving") return stay(state)
      const { take } = event
      if (take.durationMs < SOUNDBITE_MIN_MS || take.blob.size === 0)
        return stay({
          ...state,
          activity: { kind: "idle" },
          notice: NOTICES.tooShort,
        })
      const bite: Soundbite = {
        id: event.id,
        recordedAt: event.at,
        durationMs: Math.min(take.durationMs, SOUNDBITE_MAX_MS),
        mimeType: take.mimeType,
        bytes: take.blob.size,
        context: { ...event.situation, source: state.source },
      }
      return {
        state: { ...state, writing: state.writing + 1 },
        effects: [
          { type: "save", bite, audio: take.blob, replace: state.choice },
        ],
      }
    }

    case "takeFailed": {
      if (activity.kind !== "saving") return stay(state)
      return stay({
        ...state,
        activity: { kind: "idle" },
        notice: NOTICES.notKept,
      })
    }

    case "saveFailed": {
      if (activity.kind !== "saving") return stay(state)
      return writeLanded(
        { ...state, activity: { kind: "idle" }, notice: NOTICES.notKept },
        false
      )
    }

    case "saved": {
      if (activity.kind !== "saving") return stay(state)
      // Stored. A re-read that fails after this must not say otherwise, or
      // the retry it invites would keep it twice: the list goes unknown and
      // the notice still says kept.
      const next = writeLanded(
        {
          ...state,
          activity: { kind: "idle" },
          source: "direct",
          choice: null,
          notice: `Kept, ${formatDuration(event.bite.durationMs)}.`,
        },
        true
      )
      return {
        state: {
          ...next.state,
          keptNote: {
            seq: next.state.readSeq,
            durationMs: event.bite.durationMs,
          },
        },
        effects: next.effects,
      }
    }

    case "listed": {
      if (event.seq !== state.readSeq) return stay(state)
      const kept = byNewest(event.kept)
      const note = state.keptNote?.seq === event.seq ? state.keptNote : null
      return stay({
        ...state,
        library: { kind: "read", kept },
        keptNote: null,
        notice:
          note === null
            ? state.notice
            : `Kept, ${formatDuration(note.durationMs)}. ${kept.length} of ${SOUNDBITE_LIMIT} on this phone.`,
      })
    }

    case "listFailed": {
      if (event.seq !== state.readSeq) return stay(state)
      return stay({
        ...state,
        library: { kind: "unreadable" },
        keptNote: null,
      })
    }

    case "retryRead": {
      return read({ ...state, library: { kind: "reading" } })
    }

    case "playPressed": {
      if (activity.kind === "playing" && activity.id === event.id)
        return stopPlay(state)
      if (!canUseKept(activity)) return stay(state)
      const seq = state.playSeq + 1
      return {
        state: {
          ...state,
          playSeq: seq,
          activity: { kind: "playing", id: event.id, seq },
        },
        effects: [
          ...(activity.kind === "playing"
            ? [{ type: "stopPlayback" } as const]
            : []),
          { type: "loadAudio", id: event.id, seq },
        ],
      }
    }

    case "audioLoaded": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return {
        state,
        effects: [
          { type: "startPlayback", audio: event.audio, seq: event.seq },
        ],
      }
    }

    case "audioMissing": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state, NOTICES.audioMissing)
    }

    case "audioUnreadable": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state, NOTICES.notPlayable)
    }

    case "playbackEnded": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state)
    }

    case "deleteConfirmed": {
      if (!canUseKept(activity)) return stay(state)
      const stopped =
        activity.kind === "playing" && activity.id === event.id
          ? stopPlay(state)
          : stay(state)
      return {
        state: { ...stopped.state, writing: stopped.state.writing + 1 },
        effects: [...stopped.effects, { type: "remove", id: event.id }],
      }
    }

    case "removed": {
      return writeLanded(
        { ...state, choice: state.choice === event.id ? null : state.choice },
        true
      )
    }

    case "removeFailed": {
      return writeLanded({ ...state, notice: NOTICES.notDeleted }, false)
    }

    case "replacePicked": {
      return stay({ ...state, choice: event.id })
    }

    default: {
      return assertNever(event)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled soundbites event: ${JSON.stringify(value)}`)
}
