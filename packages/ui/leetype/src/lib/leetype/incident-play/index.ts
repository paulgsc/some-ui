import type { SessionLogStore } from "@leetype/lib/leetype/session-log"
import { parkedNow } from "@leetype/lib/leetype/session-log/model"
import type {
  SpokenTakes,
  SpokenTakeView,
} from "@leetype/lib/leetype/spoken-take"
import { answersOf } from "@leetype/lib/leetype/spoken-take"
import type { SessionFile } from "@leetype/types/session-file"
import { rubricText } from "@leetype/types/session-file"
import type { TakePlace } from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"

import type { Play, PlayInput, Stepped } from "./model"
import {
  confirmationTaken,
  declaredMinutes,
  medianSelectionMs,
  rubricShown,
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
  /**
   * The record screen in view's take, on the host's microphone
   * (`spoken-take`); null with none, or off a record screen.
   */
  readonly take: SpokenTakeView | null
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
 * A take kept for the record screen in view answers it, a Redo's in place of
 * the one before (D2), and Let go withdraws the answer its take gave (D3);
 * one kept after the learner moved on answers nothing. What it listens to (the
 * microphone, the app's visibility, the timer) it holds only between
 * `attach` and the cleanup `attach` returns, so a surface that mounts twice
 * (React's StrictMode) holds them once, and the timer runs on to the same
 * deadline.
 */
export class IncidentPlayRuntime {
  private snapshot: IncidentPlaySnapshot
  private readonly listeners = new Set<() => void>()
  private readonly session: string
  /** The record screen a take was started on, in this visit of it. */
  private takingFor: string | null = null
  /** The last take's ending heard, by the pattern's count. */
  private heardSeq = 0
  /** The takes kept for the screen in view, in this visit of it. */
  private visitTakes: ReadonlySet<string> = new Set<string>()
  /** What `take` was made from, so it is the same object while they are. */
  private takeFrom: ReadonlyArray<unknown> = []
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
    this.heardSeq = ports.takes?.pattern.getSnapshot().ended?.seq ?? 0
    this.snapshot = { play: null, problem: null, take: null, timeUp: false }
  }

  /** Listens to the ports until the returned cleanup runs. */
  attach = (): (() => void) => {
    const { takes, visibility } = this.ports
    const unsubscribe = [
      takes?.subscribe(this.onTake),
      takes?.pattern.subscribe(this.onTake),
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
      takes?.pattern.leave()
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

  /**
   * A parked round's worked confirmation, taken from the first screen or at
   * a round boundary. A take's is its rubric, so it is shown as one
   * (`rubricShown`), over the file's rounds still parked when its points
   * say no `covers`.
   */
  takeConfirmation = (
    fileName: string,
    file: SessionFile,
    round: string
  ): void => {
    const ctx = { at: this.ports.now(), newId: this.ports.newId }
    const screen = file.screens[round]
    const events = [
      confirmationTaken({ session: this.session, file: fileName, round }, ctx),
      ...(screen?.type === "record"
        ? rubricShown(
            {
              session: this.session,
              fileName,
              file,
              take: round,
              screen,
              parked: this.parkedOf(fileName),
            },
            ctx
          )
        : []),
    ]
    for (const event of events) this.ports.log.append(event)
    this.publishProblem()
  }

  dispatch = (input: PlayInput): void => {
    const play = this.snapshot.play
    if (play === null) return
    this.apply(step(play, input, this.context()))
  }

  /**
   * D1: starts a take of the answer on the record screen in view, a Redo
   * of its recorded answer included, or stops the take under way.
   */
  tapTake = (): void => {
    const play = this.snapshot.play
    const pattern = this.ports.takes?.pattern
    if (pattern === undefined || !onRecord(play)) return
    const answers = answersOf(play.fileName, play.screen)
    const now = pattern.getSnapshot()
    if (now.take.kind !== "idle") {
      if (now.answers === answers) pattern.tap(answers)
      return
    }
    const { spoken } = play
    if (spoken !== null && spoken.as !== "recorded") return
    this.takingFor = play.screen
    pattern.tap(answers, spoken?.take ?? null)
  }

  /** Plays a take of this answer, or stops it while it plays. */
  playTake = (id: string): void => {
    this.ports.takes?.pattern.play(id)
  }

  /** D3: sets the recorded answer's take aside, and the answer is withdrawn. */
  letGoTake = (id: string, place: TakePlace): void => {
    const play = this.snapshot.play
    const pattern = this.ports.takes?.pattern
    if (pattern === undefined || !onRecord(play)) return
    if (play.spoken?.as !== "recorded" || play.spoken.take !== id) return
    // The row's actions wait while a take is under way.
    if (pattern.getSnapshot().take.kind !== "idle") return
    pattern.letGo(id, place)
    this.dispatch({ type: "withdrawn" })
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
    const play = this.snapshot.play
    const ended = this.ports.takes?.pattern.getSnapshot().ended ?? null
    if (ended !== null && ended.seq > this.heardSeq) {
      this.heardSeq = ended.seq
      const kept = ended.ending === "kept" && onRecord(play) ? ended.id : null
      if (
        kept !== null &&
        onRecord(play) &&
        this.takingFor === play.screen &&
        ended.answers === answersOf(play.fileName, play.screen)
      ) {
        this.visitTakes = new Set([...this.visitTakes, kept])
        const take = this.ports.takes
          ?.getSnapshot()
          .takes.find(({ id }) => id === kept)
        this.dispatch({
          type: "answered",
          answer: {
            as: "recorded",
            take: kept,
            seconds: (take?.durationMs ?? 0) / 1000,
          },
        })
      }
    }
    const take = this.takeOf(this.snapshot.play)
    if (take === this.snapshot.take) return
    this.snapshot = { ...this.snapshot, take }
    this.publish()
  }

  /** The record screen in view's take, as the pattern's parts show it. */
  private takeOf(play: Play | null): SpokenTakeView | null {
    const takes = this.ports.takes
    if (takes === undefined || !onRecord(play)) return null
    const spoken = takes.getSnapshot()
    const pattern = takes.pattern.getSnapshot()
    const from = [play, spoken, pattern, this.visitTakes, this.takingFor]
    const same = from.every((input, at) => input === this.takeFrom[at])
    if (same && this.snapshot.take !== null) return this.snapshot.take
    this.takeFrom = from
    const { takes: kept, full, notesFull } = spoken
    // Only this visit's takes are this answer's: the same screen played
    // another time answers afresh.
    const view = takeItemView(
      pattern,
      kept.filter(({ id }) => this.visitTakes.has(id)),
      answersOf(play.fileName, play.screen),
      takes.pattern.options
    )
    // How a take ended is said only for one started in this visit.
    const item =
      view.said?.kind === "ended" && this.takingFor !== play.screen
        ? { ...view, said: null }
        : view
    return { item, full, notesFull }
  }

  /** The screens of `file` still parked, by the log. */
  private readonly parkedOf = (file: string): Array<string> =>
    parkedNow(this.ports.log.getSnapshot().log)
      .filter((parked) => parked.file === file)
      .map((parked) => parked.screen)

  private context(): Parameters<typeof step>[2] {
    const at = this.ports.now()
    return {
      at,
      newId: this.ports.newId,
      parked: this.parkedOf,
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
      this.visitTakes = new Set()
      this.hiddenTotal = 0
      if (this.hiddenSince !== null) this.hiddenSince = this.ports.now()
      // A take under way is kept, and answers nothing; nothing plays on.
      this.ports.takes?.pattern.leave()
    }
    if (play.ended !== null) this.cancelTimer()
    const problem = this.ports.log.getSnapshot().problem ?? this.unkept
    const take = this.takeOf(play)
    if (
      play === before &&
      problem === this.snapshot.problem &&
      take === this.snapshot.take
    ) {
      return
    }
    this.snapshot = { ...this.snapshot, play, problem, take }
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
      rubric: rubricText(screen),
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

/** The play is on a record screen. */
function onRecord(play: Play | null): play is Play {
  return play?.file.screens[play.screen]?.type === "record"
}
