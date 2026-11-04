/**
 * Runs Ideas on home (`./on-home`) against home, through the port the build
 * hands in (www's `lib/idea-home`), and the ideas kept on this phone, which
 * hear home's words for their said answers (`withHomeWords`). It turns each
 * effect into a call and each answer into an event, and decides nothing:
 * which answer still counts is `stepOnHome`'s.
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  HomeIdea,
  HomeLists,
  HomeRead,
  HomeWrite,
  ListName,
  OnHomeEffect,
  OnHomeEvent,
  OnHomeIntent,
  OnHomeState,
} from "./on-home"
import { INITIAL_ON_HOME, stepOnHome, withHomeWords } from "./on-home"
import type { IdeaStore } from "./store"

/** Home, as Ideas on home reads and writes it. Every call resolves. */
export type IdeasHome = {
  readonly ideas: () => Promise<
    HomeRead<{
      readonly ideas: ReadonlyArray<HomeIdea>
      readonly more: boolean
    }>
  >
  readonly lists: () => Promise<HomeRead<HomeLists>>
  /** The mark as it now stands. */
  readonly furnish: (
    id: string,
    furnishing: boolean
  ) => Promise<HomeWrite<boolean>>
  readonly setAside: (id: string) => Promise<HomeWrite<null>>
  /** The lists as they now stand. */
  readonly entry: (
    list: ListName,
    name: string,
    listed: boolean
  ) => Promise<HomeWrite<HomeLists>>
}

export type OnHomePorts = {
  readonly home: IdeasHome
  readonly ideas: IdeaStore
  /** Where a new idea finds the lists as home last said them. */
  readonly lists: { readonly write: (lists: HomeLists) => boolean }
}

export type OnHomeRuntime = {
  readonly getSnapshot: () => OnHomeState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (intent: OnHomeIntent) => void
  /** The screen is showing, on the lists when `lists`. Returns the detach. */
  readonly attach: (lists: boolean) => () => void
}

export function createIdeasOnHome(ports: OnHomePorts): OnHomeRuntime {
  let state = INITIAL_ON_HOME
  let attached = false
  const listeners = new Set<() => void>()

  const send = (event: OnHomeEvent): void => {
    const next = stepOnHome(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  /** An answer, once it lands, while the screen still shows. */
  const later = <T>(
    answer: Promise<T>,
    event: (value: T) => OnHomeEvent
  ): void => {
    void answer.then((value) => {
      if (attached) send(event(value))
    })
  }

  /** Ignored when not kept: New idea then picks from the last copy kept. */
  const remember = (lists: HomeLists): void => {
    ports.lists.write(lists)
  }

  function run(effect: OnHomeEffect): void {
    switch (effect.type) {
      case "readIdeas": {
        const { seq } = effect
        later(ports.home.ideas(), (read) => ({ type: "ideasRead", seq, read }))
        return
      }
      case "readLists": {
        const { seq } = effect
        later(ports.home.lists(), (read) => {
          if (read.kind === "read") remember(read.value)
          return { type: "listsRead", seq, read }
        })
        return
      }
      case "furnish": {
        const { id } = effect
        later(ports.home.furnish(id, effect.furnishing), (write) => ({
          type: "furnished",
          id,
          write,
        }))
        return
      }
      case "setAside": {
        const { id } = effect
        later(ports.home.setAside(id), (write) => ({
          type: "setAsideDone",
          id,
          write,
        }))
        return
      }
      case "entry": {
        const { listed } = effect
        const written = ports.home.entry(effect.list, effect.name, listed)
        // Kept even once the screen is left: home took the change either way.
        void written.then((write) => {
          if (write.kind === "written") remember(write.value)
        })
        later(written, (write) => ({ type: "entryDone", listed, write }))
        return
      }
      case "fill": {
        const kept = ports.ideas.list()
        if (kept === null || withHomeWords(kept, effect.ideas) === null) return
        // Ignored when nothing was kept: the words show from home either way,
        // and the next read offers them again.
        ports.ideas.keep((ideas) => withHomeWords(ideas, effect.ideas) ?? ideas)
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
    dispatch: (intent) => send(intent),
    attach(lists): () => void {
      attached = true
      send({ type: "entered", lists })
      return (): void => {
        attached = false
      }
    },
  }
}
