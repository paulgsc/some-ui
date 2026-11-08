/**
 * Runs Ideas on home (`./on-home`) against home, through the port the build
 * hands in (www's `lib/idea-home`), and the ideas kept on this phone, which
 * hear home's words for their said answers (`withHomeWords`). It turns each
 * effect into a call and each answer into an event, and decides nothing:
 * which answer still counts is `stepOnHome`'s.
 */
import { assertNever } from "@some-ui/core-utils"
import type { BundleTakes } from "@some-ui/voice-capture"

import type { Idea } from "./model"
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
  SentAgain,
} from "./on-home"
import { INITIAL_ON_HOME, stepOnHome, withHomeWords } from "./on-home"
import {
  cutShort,
  latestTakes,
  namedTakes,
  sayable,
  sendAgain,
  waitingRedos,
} from "./redo"
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

/**
 * The desk of answers said again (#2579; www's `lib/idea-takes`,
 * `send: "on-confirm"`), and the way to set a replaced take aside on home.
 */
export type RedoPorts = {
  readonly takes: BundleTakes
  /**
   * Sets each of these takes aside on home, keeping it, wherever this
   * phone keeps it: the takes answers said again replace. Says whether
   * every one was. `at`: when, ISO 8601.
   */
  readonly setAside: (ids: ReadonlyArray<string>, at: string) => boolean
}

export type OnHomePorts = {
  readonly home: IdeasHome
  readonly ideas: IdeaStore
  /** Where a new idea finds the lists as home last said them. */
  readonly lists: { readonly write: (lists: HomeLists) => boolean }
  /** Without it, no answer can be said again. */
  readonly redo?: RedoPorts | undefined
  /** Milliseconds since the epoch; `Date.now` unless a test gives one. */
  readonly now?: (() => number) | undefined
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

  const now = ports.now ?? Date.now

  /**
   * The replaced takes set aside on home first, then the new ones let go:
   * a take that still waits is what tells the next read a send was cut
   * short (`cutShort`), so neither half is lost. A note home deleted for
   * good is never set aside. Says whether both were stored.
   */
  function setAsideThenRelease(
    redo: RedoPorts,
    sent: {
      readonly release: ReadonlyArray<string>
      readonly replaced: ReadonlyArray<string>
    },
    deleted: ReadonlyArray<string>,
    at: string
  ): boolean {
    const aside = sent.replaced.filter((take) => !deleted.includes(take))
    if (aside.length > 0 && !redo.setAside(aside, at)) return false
    return sent.release.length === 0 || redo.takes.release(sent.release)
  }

  /**
   * What the ideas kept on this phone say of their said answers, to the
   * machine: which can be said again, which takes are the ideas' records
   * (never a draft to delete), and what each answer is now.
   */
  function readPhone(kept: ReadonlyArray<Idea>): void {
    send({
      type: "phoneRead",
      phone: {
        sayable: Object.fromEntries(
          kept.map((idea) => [idea.id, sayable(idea)])
        ),
        named: namedTakes(kept),
        latest: latestTakes(kept),
      },
    })
  }

  /**
   * Finishes any send again cut short, then keeps idea `id` sent again with
   * its waiting redos, then lets them go. A take a cut-short send named
   * goes first, so the take a new one replaces is always one that went.
   */
  function sentAgain(id: string, deleted: ReadonlyArray<string>): SentAgain {
    const { redo } = ports
    const listed = ports.ideas.list()
    const idea = listed?.find((each) => each.id === id)
    if (redo === undefined || listed === null || idea === undefined) {
      return "unkept"
    }
    const at = new Date(now()).toISOString()
    const takes = redo.takes.takes.getSnapshot()
    // This idea's own alone: another's is the next read's to finish, and
    // never blocks or speaks for this send. Not finished, nothing of this
    // send is kept (the new takes still wait).
    if (!setAsideThenRelease(redo, cutShort([idea], takes), deleted, at)) {
      return "unkept"
    }
    const resent = sendAgain(idea, waitingRedos(takes, id), at)
    if (resent === null) return "unkept"
    const kept = ports.ideas.keep((ideas) =>
      ideas.map((each) => (each.id === id ? resent.idea : each))
    )
    if (kept === null) return "unkept"
    // The new takes are the idea's record from here: no clean-up of drafts
    // may reach them, whatever the rest of the send comes to.
    readPhone(kept)
    return setAsideThenRelease(redo, resent, deleted, at) ? "sent" : "partly"
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
      case "settleRedos": {
        const { redo } = ports
        const kept = ports.ideas.list()
        if (redo === undefined || kept === null) return
        const cut = cutShort(kept, redo.takes.takes.getSnapshot())
        // Ignored when not stored: the takes still wait, named by the idea
        // and so never a draft, and the next read finishes it.
        setAsideThenRelease(
          redo,
          cut,
          effect.deleted,
          new Date(now()).toISOString()
        )
        readPhone(kept)
        return
      }
      case "dropRedos": {
        // Ignored when not stored: they wait, sent by nothing, and are asked
        // for again the next time the screen opens.
        ports.redo?.takes.discard(effect.takes)
        return
      }
      case "setAsideRedos": {
        const { redo } = ports
        if (redo === undefined) return
        // Ignored when not stored: the takes still wait on this phone, kept.
        setAsideThenRelease(
          redo,
          { release: effect.takes, replaced: effect.takes },
          [],
          new Date(now()).toISOString()
        )
        return
      }
      case "sendAgain": {
        send({
          type: "sentAgain",
          outcome: sentAgain(effect.id, effect.deleted),
        })
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
      const desk = ports.redo?.takes.takes
      const listed = (): void => {
        if (desk !== undefined) {
          send({ type: "redoTakes", takes: desk.getSnapshot() })
        }
      }
      // The ideas kept first: until they are read, no waiting take can be
      // told a draft from an idea's record, so none is deleted.
      const kept = desk === undefined ? null : ports.ideas.list()
      if (kept !== null) readPhone(kept)
      const unlisten = desk?.subscribe(listed)
      listed()
      send({ type: "entered", lists })
      return (): void => {
        attached = false
        unlisten?.()
      }
    },
  }
}
