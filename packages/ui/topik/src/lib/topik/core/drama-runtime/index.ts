/**
 * The drama's runtime: plain TypeScript over ports, with React only reading
 * its snapshot (docs/monorepo-boundaries.md, "Inside a React package: the
 * component is not the coordinator").
 *
 * It holds the session (`core/drama`), runs the effects makjang's engine
 * names, and owns the handles with an async lifetime, the line being voiced
 * and the scene's sting: a newer line aborts the line, leaving the scene
 * ends both, and a late result from either changes nothing. It keeps the
 * resume point the engine hands it in `persist` (Rem. 4.13).
 *
 * Lines voice themselves only once the learner has touched the lesson: a tap
 * is what lets a phone play audio at all, and a lesson that talks before
 * being asked to is another way to lose a learner (Axiom 6.1). While nothing
 * can be heard (muted, or no Korean voice) the ladder starts at Hangul, and
 * the line refused meanwhile is said once sound returns, if it is still the
 * one on screen.
 *
 * Each visit to a scene owes its sting, the feeling's tone and then its cry
 * (docs/makjang/README.md, "Where the anchor goes"), until it plays or the
 * learner leaves the scene. It plays once the learner has touched the lesson
 * with sound on: before the scene's next line, which waits for it, or at once
 * when sound is turned on and no line is playing. The learner's own replay
 * cuts it off, so it never sounds over a line.
 */

import { assertNever } from "@some-ui/core-utils"
import type {
  DramaEffect,
  MediaPorts,
  Presented,
  StingRequest,
} from "@some-ui/makjang"
import { isLine } from "@some-ui/makjang"
import type {
  DramaLesson,
  DramaSession,
  SessionEvent,
} from "@topik/lib/topik/core/drama"
import { beatsOf, openSession, stepSession } from "@topik/lib/topik/core/drama"

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
  private armed = false
  private line: AbortController | null = null
  /** The beat the voice could not say, owed once it can. */
  private owed: string | null = null
  /** The sting playing, and when it ends; a line waits for it. */
  private sting: { stop: AbortController; ended: Promise<void> } | null = null
  /** This scene visit's sting, until it plays or the scene is left. */
  private owedSting: StingRequest | null = null

  constructor(
    private readonly lesson: DramaLesson,
    private readonly ports: DramaPorts
  ) {
    const opened = openSession(
      lesson,
      ports.voice?.audible() ?? false,
      ports.points.get(lesson.id)
    )
    this.snapshot = { session: opened.session, speaking: null }
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

  /** The learner's replay: it cuts in on whatever is playing. */
  replay = (beatId: string): void => {
    this.armed = true
    this.say(beatId, true)
  }

  /**
   * Follows whether lines can be heard and whether sound is on, until the
   * returned dispose, which also stops the line and the sting in flight and
   * waits for the next touch before voicing another. Connect again after it:
   * React's StrictMode unmounts and remounts a component that keeps the same
   * runtime.
   */
  connect = (): (() => void) => {
    const { voice, sound } = this.ports
    const follow = (): void => {
      if (voice === null) return
      const audible = voice.audible()
      const moved = stepSession(this.lesson, this.snapshot.session, {
        type: "audible",
        audible,
      })
      if (moved.session !== this.snapshot.session) {
        this.publish({ ...this.snapshot, session: moved.session })
      }
      const { at } = this.snapshot.session.drama
      const owed = this.owed
      if (audible && this.armed && owed !== null) {
        this.owed = null
        if (at.kind === "beat" && at.id === owed) this.say(owed, false)
      }
    }
    follow()
    const unsubscribe = voice?.subscribe(follow)
    let soundOn = sound?.audible() ?? false
    // Sound is only turned on by a tap, which also lets the phone play it.
    const followSound = (): void => {
      if (sound === null) return
      const was = soundOn
      soundOn = sound.audible()
      if (!soundOn) {
        this.stopSting()
      } else if (!was) {
        this.armed = true
        if (this.line === null) this.playOwedSting()
      }
    }
    const unsubscribeSound = sound?.subscribe(followSound)
    return () => {
      unsubscribe?.()
      unsubscribeSound?.()
      this.armed = false
      this.owed = null
      this.stop()
    }
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
        // The scene's feeling is drawn from the snapshot; what plays is
        // its sting, owed to this visit. The last scene's sound ends here.
        case "enter-scene": {
          this.stop()
          this.owedSting = { scene: effect.scene, feeling: effect.feeling }
          break
        }
        // A choice's outcome is the engine's `first`, kept in the resume point.
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
    this.stopSting()
    this.stopLine()
  }

  private stopLine(): void {
    this.line?.abort()
    this.line = null
    if (this.snapshot.speaking !== null) {
      this.publish({ ...this.snapshot, speaking: null })
    }
  }

  private stopSting(): void {
    this.sting?.stop.abort()
    this.sting = null
  }

  /** Plays this visit's sting, if it is owed and can be heard now. */
  private playOwedSting(): void {
    const sound = this.ports.sound
    const owed = this.owedSting
    if (sound === null || owed === null || !this.armed || !sound.audible()) {
      return
    }
    this.owedSting = null
    this.stopSting()
    const stop = new AbortController()
    const done = (): void => {
      if (this.sting?.stop === stop) this.sting = null
    }
    this.sting = {
      stop,
      ended: sound.sting(owed, stop.signal).then(done, done),
    }
  }

  private say(beatId: string, interrupt: boolean): void {
    this.stopLine()
    this.owed = null
    // A replay cuts the sting off; a line the lesson reached waits for it.
    if (interrupt) this.stopSting()
    else this.playOwedSting()
    const voice = this.ports.voice
    const beat = beatsOf(this.lesson).get(beatId)
    if (voice === null || beat === undefined) return
    const line = new AbortController()
    this.line = line
    const current = (): boolean => this.line === line
    const speak = (): Promise<Presented> =>
      line.signal.aborted
        ? Promise.resolve("cancelled")
        : voice.voice(
            {
              beat: beat.id,
              text: beat.text,
              speaker: isLine(beat) ? beat.speaker : null,
              interrupt,
              onStart: () => {
                if (current()) {
                  this.publish({ ...this.snapshot, speaking: beatId })
                }
              },
            },
            line.signal
          )
    const sting = this.sting?.ended
    void (sting === undefined ? speak() : sting.then(speak)).then(
      (presented) => {
        if (!current()) return
        // Owed only when it went unsaid because nothing could be heard; a
        // line that failed is not said again on its own.
        if (presented === "unavailable" && !voice.audible()) {
          this.owed = beatId
        }
        this.line = null
        this.publish({ ...this.snapshot, speaking: null })
      }
    )
  }
}
