/**
 * The journal tab as one state machine: `step(state, event)` returns the next
 * state and the effects to run, and does nothing else. `runtime.ts` runs the
 * effects against the microphone, the store, `Audio` and the picked file, and
 * the component renders a state and turns taps into events
 * (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure:
 *
 * - **One activity at a time.** Playing, opening the microphone, recording
 *   and saving are arms of one union, and each names the cut it is for.
 * - **A take never runs past the budget.** Its limit is what the budget
 *   leaves once every other cut's take is counted (`capFor`), fixed as the
 *   take opens; a cut's target is shown, never enforced.
 * - **A write makes every read before it stale.** Each write bumps `readSeq`
 *   and the last one to land reads again, so a list read before a write can
 *   never paint over what the write changed (a target moved, say).
 * - **Nothing records while the page is off screen.** A take recording when
 *   the page is hidden or left is finished and kept; a microphone that opens
 *   then is let go.
 * - **An episode left `JOURNAL_IDLE_MS` without a take is let go** the next
 *   time the shelf is read, unless a take is under way.
 * - **Opening a primer that would let takes go waits on the person.** One
 *   that keeps every take opens at once.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  RecordingFailure,
  Take,
  TakePhase,
  TakeStep,
} from "@some-ui/voice-capture"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
} from "@some-ui/voice-capture"
import { formatDuration } from "@soundbites/lib/format"
import { SOUNDBITE_MIN_MS } from "@soundbites/lib/policy"

import type { JournalPlan, JournalTake } from "./plan"
import { capFor, droppedBy, expiresAt, isSpent, nudged } from "./plan"
import type { Primer } from "./primer"
import { readPrimer } from "./primer"
import type { JournalShelf } from "./store"

type Shelf =
  | { readonly kind: "reading" }
  | { readonly kind: "unreadable" }
  | ({ readonly kind: "read" } & JournalShelf)

/**
 * What a take is for, fixed as it opens: its cut, its cap, and the episode
 * (`openedAt`) it belongs to, which its save names so that a take finishing
 * after another primer opened is never kept in that one.
 */
type TakeFor = {
  readonly cutId: string
  readonly capMs: number
  readonly episode: string
}

export type JournalActivity =
  | { readonly kind: "idle" }
  | { readonly kind: "playing"; readonly cutId: string; readonly seq: number }
  | ({ readonly kind: "opening" } & TakeFor)
  | ({
      readonly kind: "recording"
      readonly startedAt: number
      readonly elapsed: number
      readonly level: number
    } & TakeFor)
  | ({ readonly kind: "saving" } & TakeFor)

export type JournalState = {
  readonly page: "new" | "here" | "left"
  readonly visible: boolean
  readonly shelf: Shelf
  /** The cut the sheet shows; null until a plan is read. */
  readonly selected: string | null
  readonly activity: JournalActivity
  /** Why the microphone last refused, until the next try. */
  readonly blocked: RecordingFailure | null
  readonly notice: string
  /** What is wrong with the primer file last picked, until the next pick. */
  readonly primerProblem: string | null
  /** A primer that would let takes go, waiting on the person. */
  readonly pending: {
    readonly primer: Primer
    readonly drops: ReadonlyArray<string>
    readonly at: string
  } | null
  readonly readSeq: number
  readonly playSeq: number
  readonly pickSeq: number
  /** Writes asked for and not yet heard back on. */
  readonly writing: number
}

/** What the person does. */
export type JournalIntent =
  | { readonly type: "primerPicked"; readonly file: Blob }
  | { readonly type: "replaceConfirmed" }
  | { readonly type: "replaceCancelled" }
  | { readonly type: "cutSelected"; readonly cutId: string }
  | { readonly type: "nudged"; readonly deltaMs: number }
  | { readonly type: "recordPressed" }
  | { readonly type: "discardPressed" }
  | { readonly type: "playPressed" }
  | { readonly type: "episodeDiscarded" }
  | { readonly type: "retryRead" }

type WriteKind = "open" | "targets" | "take" | "clear"

/** What the page, the clock and the ports report. */
type JournalSignal =
  | { readonly type: "arrived" }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  | { readonly type: "storeChanged" }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | { readonly type: "taken"; readonly take: Take; readonly at: string }
  | { readonly type: "takeFailed" }
  | {
      readonly type: "listed"
      readonly seq: number
      readonly shelf: JournalShelf
      readonly now: number
    }
  | { readonly type: "listFailed"; readonly seq: number }
  | {
      readonly type: "primerRead"
      readonly seq: number
      readonly text: string
      readonly at: string
    }
  | { readonly type: "primerUnreadable"; readonly seq: number }
  | { readonly type: "written"; readonly kind: Exclude<WriteKind, "take"> }
  | { readonly type: "takeSaved"; readonly take: JournalTake }
  | {
      readonly type: "writeFailed"
      readonly kind: WriteKind
      readonly reason: "full" | "stale" | "failed"
    }
  | { readonly type: "audioLoaded"; readonly seq: number; readonly audio: Blob }
  | { readonly type: "audioMissing"; readonly seq: number }
  | { readonly type: "audioUnreadable"; readonly seq: number }
  | { readonly type: "playbackEnded"; readonly seq: number }

export type JournalEvent = JournalIntent | JournalSignal

export type JournalEffect =
  | { readonly type: "openMic" }
  | { readonly type: "finishTake" }
  | { readonly type: "discardTake" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | { readonly type: "read"; readonly seq: number }
  | { readonly type: "readFile"; readonly file: Blob; readonly seq: number }
  // Each write about an episode names it (`openedAt`); the store checks the
  // name in the write's own transaction.
  | { readonly type: "openPlan"; readonly plan: JournalPlan }
  | {
      readonly type: "setTargets"
      readonly targets: JournalPlan["targets"]
      readonly episode: string
    }
  | {
      readonly type: "saveTake"
      readonly take: JournalTake
      readonly audio: Blob
      readonly episode: string
    }
  | { readonly type: "clear"; readonly episode: string }
  | { readonly type: "loadAudio"; readonly cutId: string; readonly seq: number }
  | {
      readonly type: "startPlayback"
      readonly audio: Blob
      readonly seq: number
    }
  | { readonly type: "stopPlayback" }

export type Step = {
  readonly state: JournalState
  readonly effects: ReadonlyArray<JournalEffect>
}

export const JOURNAL_NOTICES = {
  tooShort: "Too short to keep. Tap, talk, then tap again.",
  notKept: "That take couldn't be kept. Try again?",
  full: "No room for that take. Redo a long one shorter, then try again.",
  stale: "That cut is no longer in the primer, so the take wasn't kept.",
  spent: "The budget is spent. Redo a long take shorter to make room.",
  thrownAway: "Thrown away. Nothing kept.",
  notStarted: "The screen went away before the microphone opened. Tap to talk.",
  notSaved: "That change couldn't be saved. Try again?",
  notCleared: "The episode couldn't be cleared. Try again?",
  unreadableFile: "That file couldn't be read.",
  primerMidTake: "Finish the take, then open the primer again.",
  expired: "The last episode was cleared: it went a week without a take.",
  audioMissing: "That take's audio is missing.",
  notPlayable: "That take couldn't be played.",
} as const

export function initialJournalState(): JournalState {
  return {
    page: "new",
    visible: true,
    shelf: { kind: "reading" },
    selected: null,
    activity: { kind: "idle" },
    blocked: null,
    notice: "",
    primerProblem: null,
    pending: null,
    readSeq: 0,
    playSeq: 0,
    pickSeq: 0,
    writing: 0,
  }
}

/** Whether a take is opening, under way or not yet stored. */
export function isTaking(activity: JournalActivity): boolean {
  return (
    activity.kind === "opening" ||
    activity.kind === "recording" ||
    activity.kind === "saving"
  )
}

const stay = (state: JournalState): Step => ({ state, effects: [] })

/** The first cut without a take after `afterId` (or from the start), else null. */
function nextOpenCut(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>,
  afterId: string | null
): string | null {
  const from =
    afterId === null
      ? 0
      : plan.primer.cuts.findIndex((cut) => cut.id === afterId) + 1
  const open = plan.primer.cuts
    .slice(from)
    .find((cut) => !takes.some((take) => take.cutId === cut.id))
  return open?.id ?? null
}

/** The selection kept if its cut is still there, else the first without a take. */
function reselect(
  selected: string | null,
  plan: JournalPlan | null,
  takes: ReadonlyArray<JournalTake>
): string | null {
  if (plan === null) return null
  if (plan.primer.cuts.some((cut) => cut.id === selected)) return selected
  return nextOpenCut(plan, takes, null) ?? plan.primer.cuts[0]?.id ?? null
}

function read(state: JournalState): Step {
  const seq = state.readSeq + 1
  return { state: { ...state, readSeq: seq }, effects: [{ type: "read", seq }] }
}

function write(state: JournalState, effect: JournalEffect): Step {
  return {
    state: { ...state, writing: state.writing + 1, readSeq: state.readSeq + 1 },
    effects: [effect],
  }
}

function landed(state: JournalState): Step {
  const writing = Math.max(0, state.writing - 1)
  const settled = { ...state, writing }
  return writing === 0 && state.page === "here" ? read(settled) : stay(settled)
}

function withShelf(
  state: JournalState,
  plan: JournalPlan | null,
  takes: ReadonlyArray<JournalTake>
): JournalState {
  return {
    ...state,
    shelf: { kind: "read", plan, takes },
    selected: reselect(state.selected, plan, takes),
  }
}

/** The store drops the takes `primer` has no cut for, in its own write. */
function openPrimer(state: JournalState, primer: Primer, at: string): Step {
  const takes =
    state.shelf.kind === "read"
      ? state.shelf.takes.filter((take) =>
          primer.cuts.some((cut) => cut.id === take.cutId)
        )
      : []
  const plan: JournalPlan = {
    primer,
    targets: {},
    openedAt: at,
    touchedAt: at,
  }
  const opened = {
    ...withShelf({ ...state, selected: null }, plan, takes),
    pending: null,
    primerProblem: null,
    notice: `Opened "${primer.title}".`,
  }
  return write(opened, { type: "openPlan", plan })
}

function finishRecording(state: JournalState): Step {
  if (state.activity.kind !== "recording") return stay(state)
  const next = finishTake(state.activity)
  return next.kind === "taking"
    ? taking(state, takeFor(state.activity), next)
    : stay(state)
}

function takeFor(activity: TakeFor): TakeFor {
  return {
    cutId: activity.cutId,
    capMs: activity.capMs,
    episode: activity.episode,
  }
}

/** A take still under way, as the page's activity. */
function taking(
  state: JournalState,
  take: TakeFor,
  next: TakeStep & { kind: "taking" }
): Step {
  const { phase } = next
  const shown: JournalActivity =
    phase.kind === "finishing"
      ? { kind: "saving", ...take }
      : phase.kind === "opening"
        ? { kind: "opening", ...take }
        : { ...phase, ...take }
  return { state: { ...state, activity: shown }, effects: next.effects }
}

const FINISHING: TakePhase = { kind: "finishing" }

function limitsOf(take: TakeFor): { minMs: number; maxMs: number } {
  return { minMs: SOUNDBITE_MIN_MS, maxMs: take.capMs }
}

function stopPlay(state: JournalState, notice?: string): Step {
  return {
    state: {
      ...state,
      activity: { kind: "idle" },
      notice: notice ?? state.notice,
    },
    effects: [{ type: "stopPlayback" }],
  }
}

function isCurrentPlay(state: JournalState, seq: number): boolean {
  return state.activity.kind === "playing" && state.activity.seq === seq
}

/** Whether the sheet's controls (select, nudge, play, open) take a tap. */
export function isSettled(activity: JournalActivity): boolean {
  return activity.kind === "idle" || activity.kind === "playing"
}

/**
 * `then`, from `state` once any playback is stopped; nothing while a take is
 * opening, under way or being stored.
 */
function settledOnly(
  state: JournalState,
  then: (settled: JournalState) => Step
): Step {
  if (!isSettled(state.activity)) return stay(state)
  if (state.activity.kind !== "playing") return then(state)
  const stopped = stopPlay(state)
  const next = then(stopped.state)
  return {
    state: next.state,
    effects: [...stopped.effects, ...next.effects],
  }
}

export function step(state: JournalState, event: JournalEvent): Step {
  const { activity, shelf } = state
  const plan = shelf.kind === "read" ? shelf.plan : null
  const takes = shelf.kind === "read" ? shelf.takes : []

  switch (event.type) {
    case "arrived": {
      if (state.page !== "new") return stay({ ...state, page: "here" })
      return read({ ...state, page: "here" })
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
      return stay({ ...state, visible: true })
    }

    case "storeChanged": {
      // Our own writes re-read as they land; this is a write from elsewhere
      // (a share's "they arrived", another instance of the page).
      if (state.writing > 0 || state.page !== "here") return stay(state)
      return read(state)
    }

    case "retryRead": {
      return read({ ...state, shelf: { kind: "reading" } })
    }

    case "listed": {
      if (event.seq !== state.readSeq) return stay(state)
      const { plan: readPlan, takes: readTakes } = event.shelf
      if (
        readPlan !== null &&
        event.now >= expiresAt(readPlan) &&
        isSettled(activity)
      ) {
        const cleared = withShelf(
          { ...state, notice: JOURNAL_NOTICES.expired },
          null,
          []
        )
        const stopped =
          activity.kind === "playing" ? stopPlay(cleared) : stay(cleared)
        const next = write(stopped.state, {
          type: "clear",
          episode: readPlan.openedAt,
        })
        return {
          state: next.state,
          effects: [...stopped.effects, ...next.effects],
        }
      }
      return stay(withShelf(state, readPlan, readTakes))
    }

    case "listFailed": {
      if (event.seq !== state.readSeq) return stay(state)
      return stay({ ...state, shelf: { kind: "unreadable" } })
    }

    case "primerPicked": {
      if (!isSettled(activity)) return stay(state)
      const seq = state.pickSeq + 1
      return {
        state: { ...state, pickSeq: seq, primerProblem: null, pending: null },
        effects: [{ type: "readFile", file: event.file, seq }],
      }
    }

    case "primerUnreadable": {
      if (event.seq !== state.pickSeq) return stay(state)
      return stay({ ...state, primerProblem: JOURNAL_NOTICES.unreadableFile })
    }

    case "primerRead": {
      if (event.seq !== state.pickSeq) return stay(state)
      const reading = readPrimer(event.text)
      if (!reading.ok) return stay({ ...state, primerProblem: reading.problem })
      if (shelf.kind !== "read")
        return stay({
          ...state,
          primerProblem:
            "The phone's takes couldn't be read, so nothing was opened.",
        })
      // Read while a take is under way: say so, rather than drop the pick.
      if (!isSettled(activity))
        return stay({ ...state, primerProblem: JOURNAL_NOTICES.primerMidTake })
      const drops = droppedBy(reading.primer, takes)
      if (drops.length > 0)
        return stay({
          ...state,
          pending: { primer: reading.primer, drops, at: event.at },
        })
      return settledOnly(state, (settled) =>
        openPrimer(settled, reading.primer, event.at)
      )
    }

    case "replaceConfirmed": {
      const { pending } = state
      if (pending === null) return stay(state)
      return settledOnly(state, (settled) =>
        openPrimer(settled, pending.primer, pending.at)
      )
    }

    case "replaceCancelled": {
      return stay({ ...state, pending: null })
    }

    case "cutSelected": {
      if (!plan?.primer.cuts.some((cut) => cut.id === event.cutId))
        return stay(state)
      return settledOnly(state, (settled) =>
        stay({ ...settled, selected: event.cutId, notice: "" })
      )
    }

    case "nudged": {
      if (plan === null || state.selected === null || !isSettled(activity))
        return stay(state)
      const targets = nudged(plan, state.selected, event.deltaMs)
      return write(withShelf(state, { ...plan, targets }, takes), {
        type: "setTargets",
        targets,
        episode: plan.openedAt,
      })
    }

    case "recordPressed": {
      if (activity.kind === "recording") return finishRecording(state)
      if (!isSettled(activity) || plan === null || state.selected === null)
        return stay(state)
      const capMs = capFor(plan, takes, state.selected)
      if (isSpent(capMs))
        return stay({ ...state, notice: JOURNAL_NOTICES.spent })
      return {
        state: {
          ...state,
          activity: {
            kind: "opening",
            cutId: state.selected,
            capMs,
            episode: plan.openedAt,
          },
          blocked: null,
          notice: "",
        },
        effects: [
          ...(activity.kind === "playing"
            ? [{ type: "stopPlayback" } as const]
            : []),
          ...openTake().effects,
        ],
      }
    }

    case "discardPressed": {
      if (activity.kind !== "recording") return stay(state)
      return {
        state: {
          ...state,
          activity: { kind: "idle" },
          notice: JOURNAL_NOTICES.thrownAway,
        },
        effects: discardTake(activity).effects,
      }
    }

    case "ticked": {
      if (activity.kind !== "recording") return stay(state)
      const next = stepTake(activity, event, limitsOf(activity))
      return next.kind === "taking"
        ? taking(state, takeFor(activity), next)
        : stay(state)
    }

    case "micOpened": {
      if (activity.kind !== "opening") return stay(state)
      if (state.page === "left" || !state.visible)
        return {
          state: {
            ...state,
            activity: { kind: "idle" },
            notice:
              state.page === "left" ? state.notice : JOURNAL_NOTICES.notStarted,
          },
          effects: [{ type: "discardTake" }],
        }
      const next = stepTake({ kind: "opening" }, event, limitsOf(activity))
      return next.kind === "taking"
        ? taking(state, takeFor(activity), next)
        : stay(state)
    }

    case "micFailed": {
      if (activity.kind !== "opening") return stay(state)
      const next = stepTake({ kind: "opening" }, event, limitsOf(activity))
      if (next.kind !== "blocked") return stay(state)
      return stay({
        ...state,
        activity: { kind: "idle" },
        blocked: next.reason,
      })
    }

    case "taken": {
      if (activity.kind !== "saving") return stay(state)
      const next = stepTake(FINISHING, event, limitsOf(activity))
      if (next.kind === "short")
        return stay({
          ...state,
          activity: { kind: "idle" },
          notice: JOURNAL_NOTICES.tooShort,
        })
      if (next.kind !== "kept") return stay(state)
      const kept: JournalTake = {
        cutId: activity.cutId,
        recordedAt: event.at,
        // The clock stops a take at its cap a tick late at worst; the budget
        // counts no more than the cap.
        durationMs: Math.min(next.take.durationMs, activity.capMs),
        mimeType: next.take.mimeType,
      }
      return write(state, {
        type: "saveTake",
        take: kept,
        audio: next.take.blob,
        episode: activity.episode,
      })
    }

    case "takeFailed": {
      if (activity.kind !== "saving") return stay(state)
      return stay({
        ...state,
        activity: { kind: "idle" },
        notice: JOURNAL_NOTICES.notKept,
      })
    }

    case "written": {
      return landed(state)
    }

    case "takeSaved": {
      if (activity.kind !== "saving") return landed(state)
      const { take } = event
      // Shown at once, before the read lands; the next cut without a take
      // comes up, so an episode is recorded in order without hunting.
      const withTake = [
        ...takes.filter((each) => each.cutId !== take.cutId),
        take,
      ]
      const kept = landed(
        withShelf({ ...state, activity: { kind: "idle" } }, plan, withTake)
      )
      const next =
        plan === null ? null : nextOpenCut(plan, withTake, take.cutId)
      return {
        state: {
          ...kept.state,
          selected: next ?? take.cutId,
          notice: `Kept ${formatDuration(take.durationMs)}.${next === null ? "" : " Next cut is up."}`,
        },
        effects: kept.effects,
      }
    }

    case "writeFailed": {
      const notice =
        event.kind === "take"
          ? event.reason === "full"
            ? JOURNAL_NOTICES.full
            : event.reason === "stale"
              ? JOURNAL_NOTICES.stale
              : JOURNAL_NOTICES.notKept
          : event.kind === "clear"
            ? JOURNAL_NOTICES.notCleared
            : JOURNAL_NOTICES.notSaved
      const idle =
        event.kind === "take" && activity.kind === "saving"
          ? { ...state, activity: { kind: "idle" } as const }
          : state
      return landed({ ...idle, notice })
    }

    case "playPressed": {
      if (activity.kind === "playing" && activity.cutId === state.selected)
        return stopPlay(state)
      const cutId = state.selected
      if (
        !isSettled(activity) ||
        cutId === null ||
        !takes.some((take) => take.cutId === cutId)
      )
        return stay(state)
      const seq = state.playSeq + 1
      return {
        state: {
          ...state,
          playSeq: seq,
          activity: { kind: "playing", cutId, seq },
        },
        effects: [
          ...(activity.kind === "playing"
            ? [{ type: "stopPlayback" } as const]
            : []),
          { type: "loadAudio", cutId, seq },
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
      return stopPlay(state, JOURNAL_NOTICES.audioMissing)
    }

    case "audioUnreadable": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state, JOURNAL_NOTICES.notPlayable)
    }

    case "playbackEnded": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state)
    }

    case "episodeDiscarded": {
      if (plan === null) return stay(state)
      return settledOnly(state, (settled) =>
        write(
          withShelf(
            { ...settled, pending: null, notice: "Discarded." },
            null,
            []
          ),
          { type: "clear", episode: plan.openedAt }
        )
      )
    }

    default: {
      return assertNever(event)
    }
  }
}
