/**
 * Runs the interview week on the phone (IW5): the shared bundle runtime
 * (`@some-ui/voice-capture`'s `bundleRuntime`) over the week's spec
 * (`./spec`), its draft and the weeks sent (`./store`), what home holds of
 * them, and a read's cue (`./cue`), whose clock it owns.
 *
 * The screen dispatches through `dispatch`, never the bundle's own: a tap
 * that would start a read's take puts its card on screen (from the look
 * over's Say it too) and starts its cue instead, and the take starts when the
 * cue ends. Any other intent, or the screen hidden, calls a running
 * cue off first. A tap while a take is under way (to stop it) goes straight
 * through.
 *
 * A page of a question's ladder (IW8, #3175) shows one item (`focus`); once
 * it goes, the bundle steps back to the screen before the cards, a take
 * under way stopped and kept first.
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
import type { Ladder, Rung } from "./ladder"
import { ask, firsts, markRung, takesFor } from "./ladder"
import type { InterviewAtHome, InterviewKind, InterviewSent } from "./spec"
import { cardOf, interviewMachine, isClosed } from "./spec"
import type { HeldInterview } from "./store"
import { interviewDrafts, interviewLadder, interviewSent } from "./store"

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
  /** The same, from a rung's page: a take it starts is marked with `rung`. */
  readonly dispatchOn: (
    rung: Rung
  ) => (intent: BundleIntent<InterviewKind>) => void
  /** A page shows `item` while it is up. Returns the page's leaving. */
  readonly focus: (item: string) => () => void
  /** The rungs takes were said on, and each question's first take. */
  readonly ladder: Readable<Ladder>
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

  /** Puts `item`'s card on screen, from the look over or the screen before the cards too. */
  const showCard = (item: string): void => {
    const { screen } = bundle.getSnapshot()
    if (screen === "review" || screen === "sent") {
      bundle.dispatch({ type: "back" })
    }
    const index = machine.spec.items.indexOf(item)
    const now = bundle.getSnapshot()
    if (now.screen === "intro" || now.index !== index) {
      bundle.dispatch({ type: "go", index })
    }
  }

  const kept = interviewLadder(ports.storage, week.id)
  // What this phone last kept, which the ladder on screen can run ahead of.
  let written = kept.read()
  const ladder = cell(written)
  const questions = week.questions.map(({ id }) => id)
  let releasing = false
  /** Keeps `next` as the week's ladder; false when this phone couldn't. */
  const keep = (next: Ladder): boolean => {
    if (next === written) return true
    if (!kept.write(next)) return false
    written = next
    ladder.set(next)
    return true
  }
  /** Marks a take kept since it was asked for, and lets each question's first go home. */
  const climb = (): void => {
    const { takes, at } = bundle.getSnapshot()
    const marked = markRung(ladder.getSnapshot(), takes, week.id)
    const first = firsts(marked, takes, week.id, questions)
    // The marks are kept before any take goes, so none is let go twice;
    // one not kept is asked again on the next change.
    if (!keep(first.ladder)) return
    // Letting go publishes the takes again, which calls this again: a take
    // that didn't go waits for the next change, not this one's echo.
    if (first.release.length > 0 && !isClosed(week, at) && !releasing) {
      releasing = true
      try {
        ports.takes.release(first.release)
      } finally {
        releasing = false
      }
    }
  }

  const forward = (
    intent: BundleIntent<InterviewKind>,
    rung: Rung | null
  ): void => {
    const counting = cue.getSnapshot()
    if (counting.kind === "counting") {
      moveCue({ type: "cancel" })
      // A tap on the read counting down calls it off, and only that.
      if (intent.type === "tap" && intent.item === counting.item) return
    }
    const now = bundle.getSnapshot()
    if (intent.type === "tap" && !now.busy) {
      // Asked for even when this phone couldn't keep it yet, so an earlier
      // ask never marks this take; the next change keeps it.
      const asking = ask(
        ladder.getSnapshot(),
        rung === null
          ? null
          : {
              item: intent.item,
              rung,
              before: takesFor(now.takes, week.id, intent.item).map(
                ({ id }) => id
              ),
            }
      )
      if (!keep(asking)) ladder.set(asking)
      if (cardOf(intent.item) !== null || rung === "aloud") {
        showCard(intent.item)
        moveCue({ type: "start", item: intent.item })
        stopClock = ports.every(1000, () => moveCue({ type: "tick" }))
        return
      }
    }
    bundle.dispatch(intent)
  }
  const dispatch = (intent: BundleIntent<InterviewKind>): void => {
    forward(intent, null)
  }

  let focused: string | null = null
  /** A page left while its take was under way: back once the take ends. */
  let leaving = false
  const settleFocus = (): void => {
    const now = bundle.getSnapshot()
    if (!leaving || focused !== null || now.busy) return
    leaving = false
    if (now.screen === "cards") bundle.dispatch({ type: "back" })
  }
  const focus = (item: string): (() => void) => {
    focused = item
    leaving = false
    showCard(item)
    return (): void => {
      if (focused !== item) return
      focused = null
      moveCue({ type: "cancel" })
      leaving = true
      if (bundle.getSnapshot().busy) bundle.dispatch({ type: "tap", item })
      settleFocus()
    }
  }

  return {
    machine,
    bundle,
    dispatch,
    dispatchOn: (rung) => (intent) => forward(intent, rung),
    focus,
    ladder,
    atHome,
    cue,
    attach(): () => void {
      const detach = bundle.attach()
      lookHome()
      climb()
      const stopHome = bundle.subscribe(lookHome)
      const stopClimb = bundle.subscribe(climb)
      const stopFocus = bundle.subscribe(settleFocus)
      const stopHeld = ports.onHomeHolds(lookHome)
      const stopSeen = ports.onVisibility((hidden) => {
        if (hidden) moveCue({ type: "cancel" })
      })
      return (): void => {
        moveCue({ type: "cancel" })
        stopSeen()
        stopHeld()
        stopFocus()
        stopClimb()
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
