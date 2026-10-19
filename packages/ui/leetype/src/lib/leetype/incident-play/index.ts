import type { SessionLogStore } from "@leetype/lib/leetype/session-log"
import type {
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@leetype/lib/leetype/spoken-take"

import type { Play, PlayInput, Stepped } from "./model"
import {
  confirmationTaken,
  declaredMinutes,
  medianSelectionMs,
  startPlay,
  step,
} from "./model"

export type {
  PlayForm,
  PlayInput,
  Reveal,
  SpokenAnswer,
  TakeParked,
} from "./model"
export { declaredMinutes, returnFrom } from "./model"

export type IncidentPlaySnapshot = {
  readonly play: Play | null
  /**
   * The session log refused a step (`session-log`), or, after it, the phone
   * could not keep what an answer said (`SpokenTakes.note`); the surface
   * shows it.
   */
  readonly problem: string | null
  /** The microphone, when the host gives one (`spoken-take`). */
  readonly take: SpokenTakeSnapshot | null
  /** The declared length has run (Prop. 9.6): offered, never forced. */
  readonly timeUp: boolean
}

/** Whether the app is in the background, and word when that changes. */
export type Visibility = {
  readonly hidden: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

export type IncidentPlayPorts = {
  readonly log: SessionLogStore
  /** Epoch milliseconds: when a screen came into view, and when it was picked. */
  readonly now: () => number
  readonly newId: () => string
  readonly takes?: SpokenTakes
  /** Time in the background is not time taken to choose (Def. 9.4). */
  readonly visibility?: Visibility
  /** Calls `fire` after `ms`, unless cancelled. */
  readonly after?: (ms: number, fire: () => void) => () => void
}

type SpokenEvent = Extract<Stepped["events"][number], { type: "spoken" }>

const MINUTE_MS = 60_000

/**
 * One session's coordinator: the clock a selection is timed by, the time
 * the app spends in the background, the declared length's timer and the
 * microphone a spoken answer is taken on live here, never in React, and
 * every step's events go to the log in order. The session's id is made with
 * the runtime, so what the first screen records belongs to the session it
 * opens. An event the log refuses is not retried: the play goes on, and
 * `problem` carries the log's own word on it until a later append is kept,
 * or, when the log has none, that an answer's notes were not kept.
 * A take that lands for the record screen in view answers it; one that
 * lands after the learner moved on answers nothing. What it listens to (the
 * microphone, the app's visibility, the timer) it holds only between
 * `attach` and the cleanup `attach` returns, so a surface that mounts twice
 * (React's StrictMode) holds them once, and the timer runs on to the same
 * deadline.
 */
export class IncidentPlayRuntime {
  private snapshot: IncidentPlaySnapshot
  private readonly listeners = new Set<() => void>()
  private readonly session: string
  /** The record screen a take was started on, and the take answered last. */
  private takingFor: string | null = null
  private answeredTake: string | null = null
  /** Background time since the screen in view came into view. */
  private hiddenSince: number | null = null
  private hiddenTotal = 0
  private cancelTimer: () => void = () => undefined
  /** When the declared length runs, on the runtime's clock. */
  private deadline: number | null = null
  private attached = false
  /** A settled answer's notes the phone could not keep. */
  private unkept: string | null = null

  constructor(private readonly ports: IncidentPlayPorts) {
    this.session = ports.newId()
    this.snapshot = {
      play: null,
      problem: null,
      take: ports.takes?.getSnapshot() ?? null,
      timeUp: false,
    }
  }

  /** Listens to the ports until the returned cleanup runs. */
  attach = (): (() => void) => {
    const { takes, visibility } = this.ports
    const unsubscribe = [
      takes?.subscribe(this.onTake),
      visibility?.subscribe(this.onVisibility),
    ]
    if (visibility?.hidden()) this.hiddenSince ??= this.ports.now()
    this.attached = true
    this.onTake()
    this.arm()
    // The surface is going: a take under way is kept, and answers nothing.
    return () => {
      this.attached = false
      this.takingFor = null
      takes?.stop()
      this.cancelTimer()
      for (const off of unsubscribe) off?.()
    }
  }

  getSnapshot = (): IncidentPlaySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = (args: Omit<Parameters<typeof startPlay>[0], "session">): void => {
    if (this.snapshot.play !== null) return
    this.apply(startPlay({ ...args, session: this.session }, this.context()))
    const minutes = declaredMinutes(
      args.file,
      args.form,
      args.from !== undefined,
      args.limitMinutes
    )
    // The declaration says whole minutes; the timer keeps to what the host
    // has left, which can be less than one.
    const ms = Math.min(minutes, args.limitMinutes ?? minutes) * MINUTE_MS
    this.deadline = this.ports.now() + ms
    this.arm()
  }

  /** A parked round's worked confirmation, taken from the first screen. */
  takeConfirmation = (file: string, round: string): void => {
    this.ports.log.append(
      confirmationTaken(
        { session: this.session, file, round },
        { at: this.ports.now(), newId: this.ports.newId }
      )
    )
    this.publishProblem()
  }

  dispatch = (input: PlayInput): void => {
    const play = this.snapshot.play
    if (play === null) return
    this.apply(step(play, input, this.context()))
  }

  /** Starts a take of the answer on the record screen in view. */
  record = (): void => {
    const play = this.snapshot.play
    if (play?.file.screens[play.screen]?.type !== "record") return
    // A take already there landed late, for an earlier visit: it is never
    // this one's answer.
    this.answeredTake = this.ports.takes?.getSnapshot().last?.id ?? null
    this.takingFor = play.screen
    this.ports.takes?.start({ file: play.fileName, screen: play.screen })
  }

  stopRecording = (): void => {
    this.ports.takes?.stop()
  }

  /** Sets the timer for what is left of the declared length. */
  private arm(): void {
    this.cancelTimer()
    this.cancelTimer = (): void => undefined
    const { play, timeUp } = this.snapshot
    if (!this.attached || this.deadline === null || timeUp) return
    // Not started (no play), or ended.
    if (play?.ended !== null) return
    const after = this.ports.after ?? defaultAfter
    const left = Math.max(0, this.deadline - this.ports.now())
    this.cancelTimer = after(left, () => {
      this.snapshot = { ...this.snapshot, timeUp: true }
      this.publish()
    })
  }

  private readonly onVisibility = (): void => {
    const now = this.ports.now()
    if (this.ports.visibility?.hidden()) {
      this.hiddenSince ??= now
    } else if (this.hiddenSince !== null) {
      this.hiddenTotal += now - this.hiddenSince
      this.hiddenSince = null
    }
  }

  private readonly onTake = (): void => {
    const take = this.ports.takes?.getSnapshot() ?? null
    const play = this.snapshot.play
    const last = take?.last ?? null
    this.snapshot = { ...this.snapshot, take }
    if (
      play !== null &&
      last !== null &&
      last.id !== this.answeredTake &&
      this.takingFor === play.screen &&
      play.spoken === null
    ) {
      this.answeredTake = last.id
      this.dispatch({
        type: "answered",
        answer: {
          as: "recorded",
          take: last.id,
          seconds: last.durationMs / 1000,
        },
      })
      return
    }
    this.publish()
  }

  private context(): Parameters<typeof step>[2] {
    const at = this.ports.now()
    return {
      at,
      newId: this.ports.newId,
      medianMs: medianSelectionMs(this.ports.log.getSnapshot().log),
      hiddenMs:
        this.hiddenTotal +
        (this.hiddenSince === null ? 0 : at - this.hiddenSince),
    }
  }

  private apply({ play, events }: Stepped): void {
    const before = this.snapshot.play
    for (const event of events) {
      this.ports.log.append(event)
      if (event.type === "spoken" && before !== null) {
        this.noteAnswer(before, event.answer)
      }
    }
    if (play.screen !== before?.screen || play.ended !== before.ended) {
      this.takingFor = null
      this.hiddenTotal = 0
      if (this.hiddenSince !== null) this.hiddenSince = this.ports.now()
      if (play.file.screens[play.screen]?.type === "record") {
        this.ports.takes?.reset()
      }
    }
    if (play.ended !== null) this.cancelTimer()
    const problem = this.ports.log.getSnapshot().problem ?? this.unkept
    if (play === before && problem === this.snapshot.problem) return
    this.snapshot = { ...this.snapshot, play, problem }
    this.publish()
  }

  /** What a settled answer said goes beside its take (`SpokenTakes.note`). */
  private noteAnswer(play: Play, answer: SpokenEvent["answer"]): void {
    const screen = play.file.screens[play.screen]
    const spoken = play.spoken
    if (
      screen?.type !== "record" ||
      spoken === null ||
      spoken.as === "passed" ||
      answer.as === "passed"
    ) {
      return
    }
    const kept = this.ports.takes?.note({
      take: spoken.as === "recorded" ? spoken.take : null,
      file: play.fileName,
      screen: play.screen,
      prompt: screen.prompt,
      rubric: screen.rubric,
      ticks: answer.ticks,
      typed: spoken.as === "typed" ? spoken.text : null,
    })
    this.unkept =
      kept === false
        ? "This phone could not keep what that answer said. Share your answers with a study-context export to make room."
        : null
  }

  private publishProblem(): void {
    const problem = this.ports.log.getSnapshot().problem ?? this.unkept
    if (problem === this.snapshot.problem) return
    this.snapshot = { ...this.snapshot, problem }
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}

function defaultAfter(ms: number, fire: () => void): () => void {
  const timer = setTimeout(fire, ms)
  return () => clearTimeout(timer)
}

/** The page's own visibility, for the runtime's `visibility` port. */
export const pageVisibility: Visibility = {
  hidden: () =>
    typeof document !== "undefined" && document.visibilityState === "hidden",
  subscribe: (listener) => {
    if (typeof document === "undefined") return () => undefined
    document.addEventListener("visibilitychange", listener)
    return () => document.removeEventListener("visibilitychange", listener)
  },
}
