import type { SessionLogStore } from "@leetype/lib/leetype/session-log"
import type {
  SpokenTakes,
  SpokenTakeSnapshot,
} from "@leetype/lib/leetype/spoken-take"
import type { SessionFile } from "@leetype/types/session-file"

import type { Play, PlayForm, PlayInput, Stepped } from "./model"
import { medianSelectionMs, startPlay, step } from "./model"

export type { PlayForm, PlayInput, Reveal, SpokenAnswer } from "./model"
export { returnFrom, SHORT_FORM_MINUTES } from "./model"

export type IncidentPlaySnapshot = {
  readonly play: Play | null
  /** The session log refused a step; the surface shows it (`session-log`). */
  readonly problem: string | null
  /** The microphone, when the host gives one (`spoken-take`). */
  readonly take: SpokenTakeSnapshot | null
}

export type IncidentPlayPorts = {
  readonly log: SessionLogStore
  /** Epoch milliseconds: when a screen came into view, and when it was picked. */
  readonly now: () => number
  readonly newId: () => string
  readonly takes?: SpokenTakes
}

type SpokenEvent = Extract<Stepped["events"][number], { type: "spoken" }>

/**
 * One session's coordinator: the clock a selection is timed by and the
 * microphone a spoken answer is taken on live here, never in React, and
 * every step's events go to the log in order. An event the log refuses is
 * not retried: the play goes on, and `problem` carries the log's own word on
 * it until a later append is kept. A take that lands for the record screen
 * in view answers it; one that lands after the learner moved on answers
 * nothing.
 */
export class IncidentPlayRuntime {
  private snapshot: IncidentPlaySnapshot
  private readonly listeners = new Set<() => void>()
  /** The record screen a take was started on, and the take answered last. */
  private takingFor: string | null = null
  private answeredTake: string | null = null
  private readonly unsubscribe: () => void

  constructor(private readonly ports: IncidentPlayPorts) {
    this.snapshot = {
      play: null,
      problem: null,
      take: ports.takes?.getSnapshot() ?? null,
    }
    this.unsubscribe =
      ports.takes?.subscribe(this.onTake) ?? ((): void => undefined)
  }

  getSnapshot = (): IncidentPlaySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = (args: {
    readonly fileName: string
    readonly file: SessionFile
    readonly form: PlayForm
    readonly returning?: { readonly round: string; readonly reading: string }
  }): void => {
    this.apply(
      startPlay({ ...args, session: this.ports.newId() }, this.context())
    )
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
    this.takingFor = play.screen
    this.ports.takes?.start({ file: play.fileName, screen: play.screen })
  }

  stopRecording = (): void => {
    this.ports.takes?.stop()
  }

  /** The surface is going: a take under way is kept, and answers nothing. */
  close = (): void => {
    this.takingFor = null
    this.ports.takes?.stop()
    this.unsubscribe()
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
    return {
      at: this.ports.now(),
      newId: this.ports.newId,
      medianMs: medianSelectionMs(this.ports.log.getSnapshot().log),
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
    if (play.screen !== before?.screen) {
      this.takingFor = null
      if (play.file.screens[play.screen]?.type === "record") {
        this.ports.takes?.reset()
      }
    }
    const { problem } = this.ports.log.getSnapshot()
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
      answer.as === "passed"
    ) {
      return
    }
    this.ports.takes?.note({
      take: spoken.as === "recorded" ? spoken.take : null,
      file: play.fileName,
      screen: play.screen,
      prompt: screen.prompt,
      rubric: screen.rubric,
      ticks: answer.ticks,
      typed: spoken.as === "typed" ? spoken.text : null,
    })
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
