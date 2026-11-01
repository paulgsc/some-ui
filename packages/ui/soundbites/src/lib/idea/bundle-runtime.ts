/**
 * Runs the bundle machine (`./bundle`) against the outside world: the take
 * pattern on the phone's desk of idea takes (www's `lib/idea-takes`, with
 * `send: "on-confirm"`), the draft (`./draft`), the ideas kept (`./store`),
 * the lists an idea picks from, and home. It turns each effect into a call
 * on a port and each answer into an event, stamps each tap with when it
 * happened, and decides nothing: which answer still counts is the step's.
 *
 * Send is three writes in one order: the idea joins the ideas kept, which
 * only grow; then its takes are let go home; then the draft is cleared. A
 * Send stopped between them leaves takes a kept idea names waiting, which
 * the next opening lets go (`settle`), and a draft already kept, which it
 * clears.
 */
import { assertNever } from "@some-ui/core-utils"
import type { PatternTake, TakePattern } from "@some-ui/voice-capture"

import type {
  BundleEffect,
  BundleEvent,
  BundleIntent,
  BundleState,
  HomeReach,
} from "./bundle"
import { initialBundle, stepBundle } from "./bundle"
import type { DraftStore, IdeaLists } from "./draft"
import type { IdeaStore } from "./store"

/** The phone's desk of idea takes, as a new idea uses it. */
export type BundleTakes = {
  /** The take pattern, with `send: "on-confirm"`. */
  readonly pattern: TakePattern
  /** The takes as the pattern lists them, the same array while unchanged. */
  readonly takes: {
    readonly getSnapshot: () => ReadonlyArray<PatternTake>
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * Deletes these takes for good, with their audio, of those that never
   * left the phone; says whether every one was.
   */
  readonly discard: (ids: ReadonlyArray<string>) => boolean
  /** Lets these takes go home: their idea is sent. Says whether kept. */
  readonly release: (ids: ReadonlyArray<string>) => boolean
}

/** Home, as a new idea needs it. */
export type IdeaHome = {
  readonly reach: () => HomeReach
  readonly subscribe: (listener: () => void) => () => void
}

/** No home: a phone never paired. */
export const NO_HOME: IdeaHome = {
  reach: () => "unpaired",
  subscribe: () => () => undefined,
}

export type BundlePorts = {
  readonly takes: BundleTakes
  readonly drafts: DraftStore
  readonly ideas: IdeaStore
  /** The topics and keywords an idea picks from. */
  readonly lists: () => IdeaLists
  readonly home: IdeaHome
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /** A new idea's id: letters, digits and dashes. */
  readonly newId: () => string
}

export type BundleRuntime = {
  readonly getSnapshot: () => BundleState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: BundleIntent) => void
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

export function createIdeaBundle(ports: BundlePorts): BundleRuntime {
  const at = (): string => new Date(ports.now()).toISOString()
  let state = initialBundle(ports.newId(), at())
  const listeners = new Set<() => void>()
  const { pattern } = ports.takes

  const send = (event: BundleEvent): void => {
    const next = stepBundle(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  function run(effect: BundleEffect): void {
    switch (effect.type) {
      case "open": {
        send({
          type: "opened",
          draft: ports.drafts.read(),
          kept: ports.ideas.list(),
          takes: ports.takes.takes.getSnapshot(),
          lists: ports.lists(),
          id: ports.newId(),
          at: at(),
        })
        return
      }
      case "keepDraft": {
        send({ type: "draftKept", kept: ports.drafts.write(effect.draft) })
        return
      }
      case "tap": {
        pattern.tap(effect.answers, effect.supersedes)
        return
      }
      case "play": {
        pattern.play(effect.take)
        return
      }
      case "stopPlaying": {
        pattern.stopPlaying()
        return
      }
      case "deleteTake": {
        pattern.letGo(effect.take, "phone")
        send({
          type: "deleted",
          deleted: pattern.getSnapshot().discarded === effect.take,
        })
        return
      }
      case "deleteAll": {
        pattern.stopPlaying()
        const deleted =
          ports.takes.discard(effect.takes) && ports.drafts.write(null)
        send({ type: "deletedAll", deleted, id: ports.newId(), at: at() })
        return
      }
      case "send": {
        const { idea } = effect
        const kept = ports.ideas.keep((ideas) =>
          ideas.some((each) => each.id === idea.id) ? ideas : [...ideas, idea]
        )
        const sent = kept?.find((each) => each.id === idea.id) ?? null
        if (sent !== null) {
          // A take not let go now is let go at the next opening (`settle`).
          ports.takes.release(effect.takes)
          ports.drafts.write(null)
        }
        send({ type: "sentKept", idea: sent })
        return
      }
      case "settle": {
        ports.takes.release(effect.takes)
        return
      }
      case "leave": {
        pattern.leave()
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  /** What the pattern says, as the machine's events: only what changed. */
  let seen = pattern.getSnapshot()
  const watchPattern = (): void => {
    const now = pattern.getSnapshot()
    const before = seen
    seen = now
    const busy = now.take.kind !== "idle"
    if (busy !== (before.take.kind !== "idle")) send({ type: "busy", busy })
    if (now.ended !== null && now.ended !== before.ended) {
      send({ type: "ended", ended: now.ended })
    }
    const playing = now.playback.kind === "quiet" ? null : now.playback.id
    send({ type: "playing", take: playing })
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: (intent) =>
      send(
        intent.type === "another"
          ? { ...intent, at: at(), id: ports.newId() }
          : { ...intent, at: at() }
      ),
    attach(): () => void {
      seen = pattern.getSnapshot()
      const stops = [
        pattern.subscribe(watchPattern),
        ports.takes.takes.subscribe(() =>
          send({ type: "takes", takes: ports.takes.takes.getSnapshot() })
        ),
        ports.home.subscribe(() =>
          send({ type: "reach", reach: ports.home.reach() })
        ),
      ]
      send({ type: "entered", at: at() })
      send({ type: "reach", reach: ports.home.reach() })
      if (seen.take.kind !== "idle") send({ type: "busy", busy: true })
      return () => {
        for (const stop of stops) stop()
        send({ type: "left" })
      }
    },
  }
}
