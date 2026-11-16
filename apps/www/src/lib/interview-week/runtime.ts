/**
 * Runs the interview week on the phone (IW5): the shared bundle runtime
 * (`@some-ui/voice-capture`'s `bundleRuntime`) over the week's spec
 * (`./spec`), its draft and the weeks sent (`./store`), what home holds of
 * them, and a read's cue (`./cue`), whose clock it owns.
 *
 * The screen dispatches through `dispatch`, never the bundle's own: a tap
 * that would start a read's take starts its cue instead, and the take starts
 * when the cue ends. Any other intent, or the screen hidden, calls a running
 * cue off first. A tap while a take is under way (to stop it) goes straight
 * through.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { weekOpenNow } from "@some-ui/core-utils"
import type {
  BundleHome,
  BundleIntent,
  BundleMachine,
  BundleRuntime,
  BundleTakes,
} from "@some-ui/voice-capture"
import { bundleRuntime, sendsAtHome } from "@some-ui/voice-capture"

import type { Cue, CueEvent } from "./cue"
import { NO_CUE, stepCue } from "./cue"
import type { InterviewAtHome, InterviewKind, InterviewSent } from "./spec"
import { cardOf, interviewMachine } from "./spec"
import type { HeldInterview } from "./store"
import { interviewDrafts, interviewSent } from "./store"

export type InterviewWeekPorts = {
  /** The week to play: the one this phone holds that is open now. */
  readonly week: HeldInterview
  /** The phone's desk of the week's takes, with `send: "on-confirm"`. */
  readonly takes: BundleTakes
  /** Where the draft and the weeks sent are kept. */
  readonly storage: KeyedStorage | null
  readonly home: BundleHome
  /** Whether home holds this send of the week, as the link last heard; never asked of home. */
  readonly homeHolds: (sent: InterviewSent) => boolean
  /** Calls `listener` whenever what `homeHolds` answers may have changed. Returns the stop. */
  readonly onHomeHolds: (listener: () => void) => () => void
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Calls `tick` every `ms` until the stop it returns is called. */
  readonly every: (ms: number, tick: () => void) => () => void
}

/** A store the screen reads: the same object while unchanged. */
type Readable<T> = {
  readonly getSnapshot: () => T
  readonly subscribe: (listener: () => void) => () => void
}

export type InterviewWeekRun = {
  readonly machine: BundleMachine<InterviewKind>
  readonly bundle: BundleRuntime<InterviewKind>
  /** What the screen dispatches: the bundle's intents, through the cue. */
  readonly dispatch: (intent: BundleIntent<InterviewKind>) => void
  /** What home holds of the week and what this phone last sent. */
  readonly atHome: Readable<InterviewAtHome>
  readonly cue: Readable<Cue>
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

/** A store of one value, told to its listeners when it changes. */
function cell<T>(first: T): Readable<T> & { set: (next: T) => void } {
  let value = first
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    set(next): void {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}

export function createInterviewWeek(
  ports: InterviewWeekPorts
): InterviewWeekRun {
  const { week } = ports.week
  const machine = interviewMachine(week)
  const sends = interviewSent(ports.storage)
  const bundle = bundleRuntime(machine, {
    takes: ports.takes,
    drafts: interviewDrafts(ports.storage, week.id),
    records: sends,
    context: () => null,
    home: ports.home,
    now: ports.now,
    newId: ports.newId,
    onVisibility: ports.onVisibility,
  })

  const readAtHome = (): InterviewAtHome =>
    sendsAtHome(sends.list() ?? [], week.id, ports.homeHolds)
  const atHome = cell(readAtHome())
  const lookHome = (): void => {
    const next = readAtHome()
    const now = atHome.getSnapshot()
    if (next.holds?.at === now.holds?.at && next.last?.at === now.last?.at) {
      return
    }
    atHome.set(next)
  }

  const cue = cell<Cue>(NO_CUE)
  let stopClock: (() => void) | null = null
  const stopTicking = (): void => {
    stopClock?.()
    stopClock = null
  }
  const moveCue = (event: CueEvent): void => {
    const next = stepCue(cue.getSnapshot(), event)
    cue.set(next.cue)
    if (next.cue.kind === "idle") stopTicking()
    if (next.go !== null) bundle.dispatch({ type: "tap", item: next.go })
  }

  const dispatch = (intent: BundleIntent<InterviewKind>): void => {
    const counting = cue.getSnapshot()
    if (counting.kind === "counting") {
      moveCue({ type: "cancel" })
      // A tap on the read counting down calls it off, and only that.
      if (intent.type === "tap" && intent.item === counting.item) return
    }
    if (
      intent.type === "tap" &&
      cardOf(intent.item) !== null &&
      !bundle.getSnapshot().busy
    ) {
      moveCue({ type: "start", item: intent.item })
      stopClock = ports.every(1000, () => moveCue({ type: "tick" }))
      return
    }
    bundle.dispatch(intent)
  }

  return {
    machine,
    bundle,
    dispatch,
    atHome,
    cue,
    attach(): () => void {
      const detach = bundle.attach()
      lookHome()
      const stopHome = bundle.subscribe(lookHome)
      const stopHeld = ports.onHomeHolds(lookHome)
      const stopSeen = ports.onVisibility((hidden) => {
        if (hidden) moveCue({ type: "cancel" })
      })
      return (): void => {
        moveCue({ type: "cancel" })
        stopSeen()
        stopHeld()
        stopHome()
        detach()
      }
    },
  }
}

/** The week this phone plays at `at`; null when it holds none. */
export const currentInterview = (
  weeks: ReadonlyArray<HeldInterview>,
  at: number
): HeldInterview | null => weekOpenNow(weeks, ({ week }) => week.opens, at)
