/**
 * An answer said as a take, its words from home (MIC10, #2428): the take is
 * recorded through the shared take kit (`@some-ui/voice-capture`), kept on
 * the phone and sent home as a Studio voice note (www's
 * `lib/home-link/voice-copy`), and home's words for it are asked for until
 * they come (`heard`, www's `lib/home-link/heard`). `homeHearing` makes it an
 * `IdeaListener`, so the idea machine (`./machine`) takes its words as it
 * takes the recognizer's.
 *
 * `stepHearing` is the pure step: one take, then the asking. `homeHearing`
 * runs it over ports: the take, home, the clock and the page's visibility,
 * with one timer. It decides nothing; which answer still counts is the
 * step's.
 *
 * **IH1: a person can say an idea on any Android phone the Soundbites page
 * records on.**
 *
 * - _Claim:_ on a phone paired with home, "Say it" records a take through the
 *   take kit, whatever recognizer the phone has; once kept, the screen says
 *   home is hearing it and asks home every `pollMs` while the page shows,
 *   never while it is hidden, until `deadlineMs` from the take's keeping;
 *   home's words go to That's right / Fix, and a take whose words don't come
 *   by then is said kept (on home once home holds it, on the phone before)
 *   and the question takes typed words. A phone never paired listens through
 *   its recognizer as before (LS1), and with neither, takes typed words.
 * - _Family:_ hosts with and without an on-device recognizer × home paired
 *   or not × home reachable or not × the take held by home or not yet ×
 *   home's words arriving, never, or empty × the page shown or hidden while
 *   home hears × every way a take ends (kept, too short, no room, failed,
 *   the microphone refused).
 * - _Proof:_ `__tests__/hearing.test.ts` ("IH1"): over the shared simulated
 *   microphone and a fake home answering not held, held and not heard, and
 *   words, each ending reaches the screen that says it, a hidden page asks
 *   nothing, and the deadline ends in typing with the take kept; www's
 *   `lib/idea-hearing` test ("IH1"): paired, home hears; unpaired, the
 *   recognizer listens unchanged.
 * - _Tolerance:_ a take whose words come after the deadline, or after the
 *   screen moved on, does not fill that answer in later: the take is kept,
 *   and the answer is the words typed.
 */
import { assertNever } from "@some-ui/core-utils"
import type { RecordingFailure, TakeEnding } from "@some-ui/voice-capture"

import type { Listened } from "./machine"
import type { IdeaListener, Listening } from "./runtime"

/** What home said of a take's words, once asked. */
export type HeardAnswer =
  /** Home heard it: its words, empty when it heard none. */
  | { readonly kind: "heard"; readonly text: string }
  /** Home holds the take and hasn't heard it yet. */
  | { readonly kind: "notYet" }
  /** Home doesn't hold the take (yet: it may still be on its way). */
  | { readonly kind: "notHeld" }
  /** Home couldn't be asked, or didn't answer as it should. */
  | { readonly kind: "unreachable" }

/** How often home is asked, and for how long. */
export type HearingTiming = {
  readonly pollMs: number
  /** From the take's keeping; the page's hidden time counts too. */
  readonly deadlineMs: number
}

/**
 * Home hears each note within a pass (about a minute) of holding it, and
 * the take reaches home within a drain of being kept, so three minutes is a
 * couple of passes' room.
 */
export const HEARING_TIMING: HearingTiming = {
  pollMs: 5_000,
  deadlineMs: 3 * 60_000,
}

/** How a take ended, as the take port says it. */
type TakeEnd = {
  readonly ending: TakeEnding
  /** Where the take was kept, when `ending` is `kept`. */
  readonly id: string | null
  /** Why the microphone refused it, when `ending` is `blocked`. */
  readonly reason: RecordingFailure | null
}

type Phase =
  | { readonly kind: "taking" }
  | {
      readonly kind: "waiting"
      readonly id: string
      /** When the words stop being waited for (ms since the epoch). */
      readonly until: number
      /** Home has said it holds the take. */
      readonly held: boolean
      /** One ask is out. */
      readonly asking: boolean
    }
  | { readonly kind: "done" }

export type HearingState = {
  readonly phase: Phase
  readonly hidden: boolean
}

export const initialHearing: HearingState = {
  phase: { kind: "taking" },
  hidden: false,
}

export type HearingEvent =
  | ({ readonly type: "ended"; readonly now: number } & TakeEnd)
  | { readonly type: "tick"; readonly now: number }
  | {
      readonly type: "answered"
      readonly now: number
      readonly answer: HeardAnswer
    }
  | { readonly type: "hidden" }
  | { readonly type: "shown"; readonly now: number }
  /** Let go: nothing more is said for it. */
  | { readonly type: "cancel" }

type HearingEffect =
  /** Tell the screen home is hearing the take. */
  | { readonly type: "hearing" }
  | { readonly type: "ask"; readonly id: string }
  /** The one timer, set again: a `tick` in `ms`. */
  | { readonly type: "wait"; readonly ms: number }
  | { readonly type: "clearWait" }
  | { readonly type: "settle"; readonly result: Listened }

type Next = {
  readonly state: HearingState
  readonly effects: ReadonlyArray<HearingEffect>
}

const DONE: Phase = { kind: "done" }

/** How a take that ended without being kept is said. */
function unkept(end: TakeEnd): Listened {
  switch (end.ending) {
    case "short":
    case "early": {
      // Nothing was said into it: as a recognizer that heard nothing.
      return { kind: "heard", words: "" }
    }
    case "full": {
      return { kind: "notKept", why: "full" }
    }
    case "failed":
    case "kept": {
      // Kept with no id is a take nobody can ask home about.
      return { kind: "notKept", why: "failed" }
    }
    case "blocked": {
      return { kind: "refused", reason: end.reason ?? "failed" }
    }
    default: {
      return assertNever(end.ending)
    }
  }
}

/** The words didn't come in time: the take is kept, and where. */
function timedOut(state: HearingState, held: boolean): Next {
  return {
    state: { ...state, phase: DONE },
    effects: [
      { type: "clearWait" },
      { type: "settle", result: { kind: "kept", on: held ? "home" : "phone" } },
    ],
  }
}

/** The next ask: now, unless the page is hidden or the time is up. */
function askNext(
  state: HearingState,
  phase: Extract<Phase, { kind: "waiting" }>,
  now: number
): Next {
  if (now >= phase.until) return timedOut(state, phase.held)
  if (state.hidden) return { state: { ...state, phase }, effects: [] }
  return {
    state: { ...state, phase: { ...phase, asking: true } },
    effects: [{ type: "ask", id: phase.id }],
  }
}

export function stepHearing(
  state: HearingState,
  event: HearingEvent,
  timing: HearingTiming
): Next {
  const { phase } = state
  if (phase.kind === "done") return { state, effects: [] }
  switch (event.type) {
    case "ended": {
      if (phase.kind !== "taking") return { state, effects: [] }
      if (event.ending !== "kept" || event.id === null) {
        return {
          state: { ...state, phase: DONE },
          effects: [{ type: "settle", result: unkept(event) }],
        }
      }
      return {
        state: {
          ...state,
          phase: {
            kind: "waiting",
            id: event.id,
            until: event.now + timing.deadlineMs,
            held: false,
            asking: false,
          },
        },
        // The take is on its way home: the first ask a poll from now.
        effects: [{ type: "hearing" }, { type: "wait", ms: timing.pollMs }],
      }
    }
    case "tick": {
      if (phase.kind !== "waiting" || phase.asking) {
        return { state, effects: [] }
      }
      return askNext(state, phase, event.now)
    }
    case "answered": {
      if (phase.kind !== "waiting" || !phase.asking) {
        return { state, effects: [] }
      }
      const { answer } = event
      if (answer.kind === "heard") {
        return {
          state: { ...state, phase: DONE },
          effects: [
            { type: "clearWait" },
            {
              type: "settle",
              result: { kind: "heard", words: answer.text },
            },
          ],
        }
      }
      const next = {
        ...phase,
        asking: false,
        held: phase.held || answer.kind === "notYet",
      }
      if (event.now >= next.until) return timedOut(state, next.held)
      return {
        state: { ...state, phase: next },
        effects: state.hidden ? [] : [{ type: "wait", ms: timing.pollMs }],
      }
    }
    case "hidden": {
      if (state.hidden) return { state, effects: [] }
      return {
        state: { ...state, hidden: true },
        effects: phase.kind === "waiting" ? [{ type: "clearWait" }] : [],
      }
    }
    case "shown": {
      if (!state.hidden) return { state, effects: [] }
      const shown = { ...state, hidden: false }
      // Back on screen: ask at once, unless an ask is already out.
      if (phase.kind !== "waiting" || phase.asking) {
        return { state: shown, effects: [] }
      }
      return askNext(shown, phase, event.now)
    }
    case "cancel": {
      return {
        state: { ...state, phase: DONE },
        effects: phase.kind === "waiting" ? [{ type: "clearWait" }] : [],
      }
    }
    default: {
      return assertNever(event)
    }
  }
}

/** A take as the screen's port to the take kit sees it. */
export type IdeaTakeSnapshot = {
  /** How far the take under way is: `idle` when none is. */
  readonly take: "idle" | "opening" | "recording" | "keeping"
  /** The last take to end, `seq` counting them. */
  readonly ended: (TakeEnd & { readonly seq: number }) | null
  /** No room for another take: `start` would do nothing. */
  readonly full: boolean
}

/**
 * The take kit, as an idea's answers use it: one take at a time, started
 * on what it answers and stopped by a tap (D1), each ending said once.
 */
export type IdeaTakes = {
  readonly getSnapshot: () => IdeaTakeSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly start: (answers: string) => void
  readonly stop: () => void
  /** The screen went: a take under way is kept. */
  readonly leave: () => void
}

export type HearingPorts = {
  readonly takes: IdeaTakes
  /** Home's words for a take, by its id; never rejects. */
  readonly heard: (id: string) => Promise<HeardAnswer>
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /** As `IdeaPorts.onVisibility`: now, then on each change. */
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
  readonly timing?: HearingTiming | undefined
}

/** A listening that ended before it began. */
function settled(result: Listened): Listening {
  return {
    done: Promise.resolve(result),
    stop: () => undefined,
    cancel: () => undefined,
  }
}

/**
 * Every answer said as a take and heard by home: always available, since
 * the take kit records on every phone that records at all.
 */
export function homeHearing(ports: HearingPorts): IdeaListener {
  const timing = ports.timing ?? HEARING_TIMING
  return {
    available: () => Promise.resolve(true),
    listen: (_onWords, onReady, take): Listening => {
      const { takes } = ports
      const before = takes.getSnapshot()
      if (before.full) return settled({ kind: "notKept", why: "full" })
      // A take of the desk's own is under way: the microphone is taken.
      if (before.take !== "idle") {
        return settled({ kind: "refused", reason: "elsewhere" })
      }
      const startedAfter = before.ended?.seq ?? 0
      let state = initialHearing
      let timer: ReturnType<typeof setTimeout> | null = null
      let ready = false
      let settle: (result: Listened) => void = () => undefined
      const done = new Promise<Listened>((resolve) => {
        settle = resolve
      })
      const clearWait = (): void => {
        if (timer !== null) clearTimeout(timer)
        timer = null
      }
      const stops: Array<() => void> = []
      const close = (): void => {
        clearWait()
        for (const stop of stops.splice(0)) stop()
      }

      const send = (event: HearingEvent): void => {
        const next = stepHearing(state, event, timing)
        state = next.state
        for (const effect of next.effects) run(effect)
        if (state.phase.kind === "done") close()
      }

      function run(effect: HearingEffect): void {
        switch (effect.type) {
          case "hearing": {
            take?.onHearing()
            return
          }
          case "ask": {
            void ports.heard(effect.id).then((answer) => {
              send({ type: "answered", now: ports.now(), answer })
            })
            return
          }
          case "wait": {
            clearWait()
            timer = setTimeout(() => {
              timer = null
              send({ type: "tick", now: ports.now() })
            }, effect.ms)
            return
          }
          case "clearWait": {
            clearWait()
            return
          }
          case "settle": {
            settle(effect.result)
            return
          }
          default: {
            assertNever(effect)
          }
        }
      }

      const watch = (): void => {
        const snapshot = takes.getSnapshot()
        if (!ready && snapshot.take === "recording") {
          ready = true
          onReady()
        }
        const { ended } = snapshot
        if (
          state.phase.kind === "taking" &&
          ended &&
          ended.seq > startedAfter
        ) {
          send({ type: "ended", now: ports.now(), ...ended })
        }
      }
      stops.push(
        takes.subscribe(watch),
        ports.onVisibility((hidden) =>
          send(
            hidden ? { type: "hidden" } : { type: "shown", now: ports.now() }
          )
        )
      )
      takes.start(take?.answers ?? "idea")
      watch()

      return {
        done,
        stop: (): void => {
          if (state.phase.kind === "taking") takes.stop()
        },
        cancel: (): void => {
          // A take under way is kept, and goes home as any other.
          if (state.phase.kind === "taking") takes.leave()
          send({ type: "cancel" })
          // Ignored by the machine, which has moved on from it.
          settle({ kind: "failed" })
        },
      }
    },
  }
}
