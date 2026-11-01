/**
 * Runs the idea shelf (`shelf.ts`) against the outside world: the idea
 * store, the phone's projects and the file picked. It turns each effect into
 * a call on a port and each answer into an event, and stamps each tap with
 * when it happened. It decides nothing; which answer still counts is `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ProjectStore } from "@soundbites/lib/project/store"

import type { HeardAnswer } from "./hearing"
import type { ShelfEffect, ShelfEvent, ShelfIntent, ShelfState } from "./shelf"
import { applyShelf, initialShelfState, step, videosOf } from "./shelf"
import type { IdeaStore } from "./store"

type Hear = Extract<ShelfEffect, { type: "hear" }>

/** How often a busy link is asked again for one answer's words, and after how long. */
const BUSY_TRIES = 3
const BUSY_WAIT_MS = 1_000

export type ShelfPorts = {
  ideas: IdeaStore
  projects: Pick<ProjectStore, "list" | "update">
  /** Milliseconds since the epoch. */
  now: () => number
  /** The text of a file picked; rejects when it can't be read. */
  readText: (file: Blob) => Promise<string>
  /**
   * Home's words for a take, by its id; never rejects (www's
   * `lib/home-link/heard`). Absent where there is no home to ask.
   */
  heard?: ((take: string) => Promise<HeardAnswer>) | undefined
}

export type ShelfRuntime = {
  getSnapshot: () => ShelfState
  subscribe: (listener: () => void) => () => void
  dispatch: (intent: ShelfIntent) => void
  /** The screen is showing. Returns the detach. */
  attach: () => () => void
}

export function createIdeaShelf(ports: ShelfPorts): ShelfRuntime {
  let state = initialShelfState()
  const listeners = new Set<() => void>()
  const at = (): string => new Date(ports.now()).toISOString()

  const send = (event: ShelfEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  /**
   * Said answers whose words to ask home for, one at a time: home's link
   * runs one call at a time, and answers any other `busy`.
   */
  const waiting: Array<Hear & { readonly tries: number }> = []
  let asking = false
  const hearNext = (): void => {
    const { heard } = ports
    const next = waiting.shift()
    if (heard === undefined || asking || next === undefined) {
      if (next !== undefined) waiting.unshift(next)
      return
    }
    asking = true
    const { idea, question } = next
    void heard(next.take).then((answer) => {
      asking = false
      if (answer.kind === "heard") {
        send({ type: "heard", idea, question, words: answer.text, at: at() })
      } else if (answer.kind === "busy" && next.tries < BUSY_TRIES) {
        // The link was busy with another run: ask again a moment later.
        setTimeout(() => {
          waiting.push({ ...next, tries: next.tries + 1 })
          hearNext()
        }, BUSY_WAIT_MS)
      }
      // Not heard yet, or home can't be asked: the next reading asks again.
      hearNext()
    })
  }

  function run(effect: ShelfEffect): void {
    switch (effect.type) {
      case "read": {
        send({ type: "listed", ideas: ports.ideas.list() })
        return
      }
      case "readVideos": {
        void ports.projects.list().then(
          (projects) =>
            send({ type: "videosListed", videos: videosOf(projects) }),
          () => send({ type: "videosListed", videos: null })
        )
        return
      }
      case "readFile": {
        const { seq } = effect
        // A reader that throws rather than rejecting is a read that failed.
        void Promise.resolve(effect.file)
          .then(ports.readText)
          .then(
            (text) => send({ type: "replyRead", seq, text, at: at() }),
            () => send({ type: "replyUnreadable", seq })
          )
        return
      }
      case "keep": {
        const { op } = effect
        const applied = { changed: false }
        const ideas = ports.ideas.keep((held) => {
          const next = applyShelf(held, op, effect.at)
          applied.changed = next.some((idea, i) => idea !== held[i])
          return next
        })
        // What the store held may already have had it (another screen's
        // pick of the same reply, say): then nothing was added.
        const notice =
          applied.changed || op.kind !== "reply" ? effect.notice : "alreadyKept"
        send({ type: "kept", ideas, notice })
        return
      }
      case "hear": {
        if (ports.heard === undefined) return
        if (!waiting.some((each) => each.take === effect.take)) {
          waiting.push({ ...effect, tries: 0 })
        }
        hearNext()
        return
      }
      case "create": {
        const { project } = effect
        void ports.projects
          .update(project.id, (held) => (held === null ? project : null))
          .then(
            (written) =>
              send({
                type: "made",
                project: written.changed ? project.id : null,
              }),
            () => send({ type: "made", project: null })
          )
        return
      }
      default: {
        assertNever(effect)
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch: (intent) => send({ ...intent, at: at() }),
    attach(): () => void {
      send({ type: "entered", at: at() })
      return () => undefined
    },
  }
}
