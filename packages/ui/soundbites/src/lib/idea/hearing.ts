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
 *   home is hearing it and asks home every `pollMs` while the page shows, never
 *   while it is hidden, until `deadlineMs` from the take's keeping; home's
 *   words go to That's right / Fix, unless they come after the deadline, which
 *   an ask still out doesn't move. It stops waiting at once, the take kept and
 *   the question taking typed words, when the take is silent (D4), when home
 *   doesn't answer (it can't be reached), and when home says it knows no words
 *   for a take the phone has read back that home holds; otherwise at the
 *   deadline. Where it says the take is kept comes from what the phone has read
 *   back of home (or home's own word that it holds it), never from home not
 *   knowing it. A take let go while under way (Type instead, Skip, the screen
 *   going) is kept, and the screen counts it. A phone never paired listens
 *   through its recognizer as before (LS1), and with neither, takes typed
 *   words; for `AWAY_MS` after home didn't answer, while the phone holds the
 *   same pairing, www's `lib/idea-hearing` hears through the recognizer when
 *   the phone has one, and takes typed words when not, and the next question
 *   to open after that offers "Say it" again (`./machine`'s `step`).
 * - _Family:_ hosts with and without an on-device recognizer × home paired
 *   or not × home reachable, busy or not × the take held by home or not yet
 *   (as read back, and as home says) × home's words arriving, never, or
 *   empty, and home's read missing (`404` for a take it holds) × the page
 *   shown or hidden while home hears × every way a take ends (kept, kept
 *   silent, too short, no room, failed, the microphone refused) × a
 *   cancel before, during or after the take.
 * - _Proof:_ `__tests__/hearing.test.ts` ("IH1"): over the shared simulated
 *   microphone, the real take kit and a fake home, each ending reaches the
 *   screen that says it, a hidden page asks nothing, a busy link is asked
 *   again, an ask still out at the deadline doesn't move it and its late words
 *   are dropped, "Say it" comes back on the same screen once home is no longer
 *   skipped, the deadline ends in typing with the take kept where the phone
 *   read back it is, no answer and a missing read for a held take settle at
 *   once, a silent take settles without asking, and a cancel during a take
 *   counts it; www's `lib/idea-takes` test ("IH1") runs the same through the
 *   real desk's mapping; www's `lib/idea-hearing` test ("IH1"): paired, home
 *   hears; unpaired, the recognizer listens unchanged; home not answering, the
 *   recognizer or typing for `AWAY_MS`.
 * - _Tolerance:_ a take whose words come after the deadline, or after the
 *   screen moved on, does not fill that answer in later: the take is kept,
 *   and the answer is the words typed. A take the read-back has not yet
 *   seen home holding is said kept on the phone.
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
  /**
   * Home doesn't know the take's words: it doesn't hold it yet, or (when
   * the phone has read back that it does) it can't give words back.
   */
  | { readonly kind: "notHeld" }
  /** The link was busy with another run: nothing was asked. */
  | { readonly kind: "busy" }
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
  /** Kept, and the microphone never heard talking in it (MIC8, D4). */
  readonly unheard: boolean
}

type Phase =
  | { readonly kind: "taking" }
  /** Let go while the take was under way: it is being kept, unheard. */
  | { readonly kind: "leaving" }
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

/**
 * `holds`: whether home holds the take, as this phone last read back from
 * home (www's voice lane), read when the event happened.
 */
export type HearingEvent =
  | ({ readonly type: "ended"; readonly now: number } & TakeEnd)
  | { readonly type: "tick"; readonly now: number; readonly holds: boolean }
  | {
      readonly type: "answered"
      readonly now: number
      readonly holds: boolean
      readonly answer: HeardAnswer
    }
  | { readonly type: "hidden" }
  | { readonly type: "shown"; readonly now: number; readonly holds: boolean }
  /** Let go: nothing more is said for it. */
  | { readonly type: "cancel" }

type HearingEffect =
  /** Tell the screen home is hearing the take. */
  | { readonly type: "hearing" }
  /** Keep the take under way, and send it home as any other. */
  | { readonly type: "leave" }
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

type Waiting = Extract<Phase, { kind: "waiting" }>

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

/** The hearing ends: the take is kept, where it is, and why no words. */
function keptAs(
  state: HearingState,
  on: boolean,
  why: "late" | "noWords" | "away"
): Next {
  return {
    state: { ...state, phase: DONE },
    effects: [
      { type: "clearWait" },
      {
        type: "settle",
        result: { kind: "kept", on: on ? "home" : "phone", why },
      },
    ],
  }
}

/** The next poll: in `pollMs`, or at the deadline if that comes first. */
function nextPoll(phase: Waiting, now: number, timing: HearingTiming): number {
  return Math.min(timing.pollMs, phase.until - now)
}

/**
 * The next ask: now, unless the page is hidden or the time is up. While it
 * is out the one timer is set for the deadline, so an ask home is slow to
 * answer can't stretch the wait past it.
 */
function askNext(
  state: HearingState,
  phase: Waiting,
  now: number,
  holds: boolean
): Next {
  if (now >= phase.until) return keptAs(state, phase.held || holds, "late")
  if (state.hidden) return { state: { ...state, phase }, effects: [] }
  return {
    state: { ...state, phase: { ...phase, asking: true } },
    effects: [
      { type: "ask", id: phase.id },
      { type: "wait", ms: phase.until - now },
    ],
  }
}

/** A take's ending, while it was being taken or let go. */
function ended(
  state: HearingState,
  phase: Phase,
  event: Extract<HearingEvent, { type: "ended" }>,
  timing: HearingTiming
): Next {
  const id = event.ending === "kept" ? event.id : null
  if (phase.kind === "leaving") {
    return {
      state: { ...state, phase: DONE },
      effects: [],
    }
  }
  if (phase.kind !== "taking") return { state, effects: [] }
  if (id === null) {
    return {
      state: { ...state, phase: DONE },
      effects: [{ type: "settle", result: unkept(event) }],
    }
  }
  if (event.unheard) {
    // Kept and sent home, but nothing was said into it: home has no words
    // to give, so it is said at once, as a recognizer that heard nothing.
    return {
      state: { ...state, phase: DONE },
      effects: [{ type: "settle", result: { kind: "heard", words: "" } }],
    }
  }
  return {
    state: {
      ...state,
      phase: {
        kind: "waiting",
        id,
        until: event.now + timing.deadlineMs,
        held: false,
        asking: false,
      },
    },
    // The take is on its way home: the first ask a poll from now.
    effects: [{ type: "hearing" }, { type: "wait", ms: timing.pollMs }],
  }
}

/** Home's answer to the ask that was out. */
function answered(
  state: HearingState,
  phase: Waiting,
  event: Extract<HearingEvent, { type: "answered" }>,
  timing: HearingTiming
): Next {
  const { answer, holds } = event
  if (event.now >= phase.until) {
    // Past the deadline: whatever home says now is too late for this answer.
    const said = answer.kind === "notYet" || answer.kind === "heard"
    return keptAs(state, phase.held || holds || said, "late")
  }
  switch (answer.kind) {
    case "heard": {
      return {
        state: { ...state, phase: DONE },
        effects: [
          { type: "clearWait" },
          { type: "settle", result: { kind: "heard", words: answer.text } },
        ],
      }
    }
    case "unreachable": {
      // Home isn't answering: waiting out the deadline would gain nothing.
      return keptAs(state, phase.held || holds, "away")
    }
    case "notHeld": {
      // This phone has read back that home holds the take, and home says
      // it knows no words for it: it can't give them back.
      if (holds) return keptAs(state, true, "noWords")
      break
    }
    case "notYet":
    case "busy": {
      break
    }
    default: {
      return assertNever(answer)
    }
  }
  const next: Waiting = {
    ...phase,
    asking: false,
    held: phase.held || answer.kind === "notYet",
  }
  return {
    state: { ...state, phase: next },
    effects: state.hidden
      ? []
      : [{ type: "wait", ms: nextPoll(next, event.now, timing) }],
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
      return ended(state, phase, event, timing)
    }
    case "tick": {
      if (phase.kind !== "waiting") return { state, effects: [] }
      if (phase.asking) {
        // The deadline, with an ask still out: the wait ends now, and its
        // answer, when it comes, is dropped.
        return event.now >= phase.until
          ? keptAs(state, phase.held || event.holds, "late")
          : { state, effects: [] }
      }
      return askNext(state, phase, event.now, event.holds)
    }
    case "answered": {
      if (phase.kind !== "waiting" || !phase.asking) {
        return { state, effects: [] }
      }
      return answered(state, phase, event, timing)
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
      if (phase.kind !== "waiting") return { state: shown, effects: [] }
      // Back on screen: ask at once, unless an ask is already out, whose
      // deadline timer hiding the page cleared.
      if (phase.asking) {
        return event.now >= phase.until
          ? keptAs(shown, phase.held || event.holds, "late")
          : {
              state: shown,
              effects: [{ type: "wait", ms: phase.until - event.now }],
            }
      }
      return askNext(shown, phase, event.now, event.holds)
    }
    case "cancel": {
      switch (phase.kind) {
        case "taking": {
          // A take under way is kept, and goes home as any other.
          return {
            state: { ...state, phase: { kind: "leaving" } },
            effects: [{ type: "leave" }],
          }
        }
        case "waiting": {
          return {
            state: { ...state, phase: DONE },
            effects: [{ type: "clearWait" }],
          }
        }
        case "leaving": {
          return { state, effects: [] }
        }
        default: {
          return assertNever(phase)
        }
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
  /**
   * Whether home holds take `id`, as this phone last read back from home
   * (www's voice lane): where a take is, said from what the phone knows.
   */
  readonly held: (id: string) => boolean
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
      /** Whether home holds the take being heard, as last read back. */
      const holds = (): boolean =>
        state.phase.kind === "waiting" && takes.held(state.phase.id)
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
          case "leave": {
            takes.leave()
            return
          }
          case "ask": {
            const { id } = effect
            void ports.heard(id).then((answer) => {
              send({
                type: "answered",
                now: ports.now(),
                holds: takes.held(id),
                answer,
              })
            })
            return
          }
          case "wait": {
            clearWait()
            timer = setTimeout(() => {
              timer = null
              send({ type: "tick", now: ports.now(), holds: holds() })
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
        const { kind } = state.phase
        if (
          (kind === "taking" || kind === "leaving") &&
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
            hidden
              ? { type: "hidden" }
              : { type: "shown", now: ports.now(), holds: holds() }
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
          // A take under way is kept and goes home; the listening is over
          // either way.
          send({ type: "cancel" })
          // Ignored by the machine, which has moved on from it.
          settle({ kind: "failed" })
        },
      }
    },
  }
}
