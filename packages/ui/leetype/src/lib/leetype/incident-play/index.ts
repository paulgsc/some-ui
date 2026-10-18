import type { SessionLogStore } from "@leetype/lib/leetype/session-log"
import type { SessionFile } from "@leetype/types/session-file"

import type { Play, PlayForm, PlayInput, Stepped } from "./model"
import { medianSelectionMs, startPlay, step } from "./model"

export type { PlayForm, PlayInput, Reveal } from "./model"
export { returnFrom } from "./model"

export type IncidentPlaySnapshot = {
  readonly play: Play | null
  /** The session log refused a step; the surface shows it (`session-log`). */
  readonly problem: string | null
}

export type IncidentPlayPorts = {
  readonly log: SessionLogStore
  /** Epoch milliseconds: when a screen came into view, and when it was picked. */
  readonly now: () => number
  readonly newId: () => string
}

/**
 * One session's coordinator: the clock a selection is timed by lives here,
 * never in React, and every step's events go to the log in order. An event
 * the log refuses is not retried: the play goes on, and `problem` carries
 * the log's own word on it until a later append is kept.
 */
export class IncidentPlayRuntime {
  private snapshot: IncidentPlaySnapshot = { play: null, problem: null }
  private readonly listeners = new Set<() => void>()

  constructor(private readonly ports: IncidentPlayPorts) {}

  getSnapshot = (): IncidentPlaySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = (args: {
    readonly fileName: string
    readonly file: SessionFile
    readonly form: PlayForm
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

  private context(): Parameters<typeof step>[2] {
    return {
      at: this.ports.now(),
      newId: this.ports.newId,
      medianMs: medianSelectionMs(this.ports.log.getSnapshot().log),
    }
  }

  private apply({ play, events }: Stepped): void {
    for (const event of events) this.ports.log.append(event)
    const { problem } = this.ports.log.getSnapshot()
    if (play === this.snapshot.play && problem === this.snapshot.problem) {
      return
    }
    this.snapshot = { play, problem }
    for (const listener of this.listeners) listener()
  }
}
