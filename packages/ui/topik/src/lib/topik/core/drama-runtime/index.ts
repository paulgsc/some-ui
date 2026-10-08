/**
 * The drama's runtime: plain TypeScript over ports, with React only reading
 * its snapshot (docs/monorepo-boundaries.md, "Inside a React package: the
 * component is not the coordinator").
 *
 * It holds the session (`core/drama`), runs the effects makjang's engine
 * names, and owns the one handle with an async lifetime, the line being
 * voiced: a newer line aborts it, and a late result from an aborted line
 * changes nothing. It keeps the resume point the engine hands it in `persist`
 * (Rem. 4.13).
 *
 * Lines voice themselves only once the learner has touched the lesson: a tap
 * is what lets a phone play audio at all, and a lesson that talks before
 * being asked to is another way to lose a learner (Axiom 6.1).
 */

import { assertNever } from "@some-ui/core-utils"
import type { Beat, DramaEffect, MediaPorts } from "@some-ui/makjang"
import { isLine, scenesOf } from "@some-ui/makjang"
import type {
  DramaLesson,
  DramaSession,
  SessionEvent,
} from "@topik/lib/topik/core/drama"
import { openSession, stepSession } from "@topik/lib/topik/core/drama"

/** Where a lesson's place is kept, by lesson id. */
export type DramaPointStore = {
  /** The stored point, unvalidated: the engine's `resume` reads it. */
  get(lessonId: string): unknown
  set(lessonId: string, point: unknown): void
}

export type DramaPorts = MediaPorts & { points: DramaPointStore }

export type DramaSnapshot = {
  session: DramaSession
  /** The beat being voiced right now, if any. */
  speaking: string | null
}

export class DramaRuntime {
  private snapshot: DramaSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly beats: ReadonlyMap<string, Beat>
  private armed = false
  private line: AbortController | null = null

  constructor(
    private readonly lesson: DramaLesson,
    private readonly ports: DramaPorts
  ) {
    this.beats = new Map(
      scenesOf(lesson.root).flatMap(({ scene }) =>
        scene.beats.map((beat): [string, Beat] => [beat.id, beat])
      )
    )
    const opened = openSession(
      lesson,
      ports.voice !== null,
      ports.points.get(lesson.id)
    )
    this.snapshot = { session: opened.session, speaking: null }
    // The opening's voice effect is dropped: nothing has been touched yet.
    this.run(opened.effects)
  }

  getSnapshot = (): DramaSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispatch = (event: SessionEvent): void => {
    this.armed = true
    const moved = stepSession(this.lesson, this.snapshot.session, event)
    if (moved.session !== this.snapshot.session) {
      this.publish({ ...this.snapshot, session: moved.session })
    }
    this.run(moved.effects)
  }

  /** The learner's own replay: it cuts in on whatever is playing. */
  replay = (beatId: string): void => {
    this.armed = true
    this.say(beatId, true)
  }

  /**
   * Stops the line in flight and waits for the next touch before voicing
   * another. The runtime stays usable: React's StrictMode unmounts and
   * remounts a component that keeps the same runtime.
   */
  dispose = (): void => {
    this.armed = false
    this.stop()
  }

  private publish(next: DramaSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private run(effects: Array<DramaEffect>): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "voice": {
          if (this.armed) this.say(effect.beat, false)
          break
        }
        case "persist": {
          this.ports.points.set(this.lesson.id, effect.point)
          break
        }
        // The scene's feeling is drawn from the snapshot; a choice's
        // outcome is the engine's `first`, kept in the resume point.
        case "enter-scene":
        case "answered": {
          break
        }
        default: {
          return assertNever(effect)
        }
      }
    }
  }

  private stop(): void {
    this.line?.abort()
    this.line = null
    if (this.snapshot.speaking !== null) {
      this.publish({ ...this.snapshot, speaking: null })
    }
  }

  private say(beatId: string, interrupt: boolean): void {
    const voice = this.ports.voice
    const beat = this.beats.get(beatId)
    if (voice === null || beat === undefined) return
    this.stop()
    const line = new AbortController()
    this.line = line
    const current = (): boolean => this.line === line
    void voice
      .voice(
        {
          beat: beat.id,
          text: beat.text,
          speaker: isLine(beat) ? beat.speaker : null,
          interrupt,
          onStart: () => {
            if (current()) this.publish({ ...this.snapshot, speaking: beatId })
          },
        },
        line.signal
      )
      .then(() => {
        // A line a newer one replaced has already been cleared.
        if (!current()) return
        this.line = null
        this.publish({ ...this.snapshot, speaking: null })
      })
  }
}
