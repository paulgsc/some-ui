/**
 * Runs the idea shelf (`shelf.ts`) against the outside world: the idea
 * store, the phone's projects and the file picked. It turns each effect into
 * a call on a port and each answer into an event, and stamps each tap with
 * when it happened. It decides nothing; which answer still counts is `step`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ProjectStore } from "@soundbites/lib/project/store"

import type { ShelfEffect, ShelfEvent, ShelfIntent, ShelfState } from "./shelf"
import { applyShelf, initialShelfState, step, videosOf } from "./shelf"
import type { IdeaStore } from "./store"

export type ShelfPorts = {
  ideas: IdeaStore
  projects: Pick<ProjectStore, "list" | "update">
  /** Milliseconds since the epoch. */
  now: () => number
  /** The text of a file picked; rejects when it can't be read. */
  readText: (file: Blob) => Promise<string>
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
        const { op, notice } = effect
        send({
          type: "kept",
          ideas: ports.ideas.keep((ideas) => applyShelf(ideas, op, effect.at)),
          notice,
        })
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
