/**
 * The runtime behind `./serves-model`: it asks home whether it serves this
 * build (`./compat-read`) at the moments that model names, one ask at a
 * time, and keeps what home said for the marks (`./lanes`' `useServes`).
 *
 * `watchServes` hears those moments: the phone found paired (the app's
 * start, or a new pairing), the app back in the foreground, and a request
 * answered not found. An ask the link turned away while busy with another
 * read is asked once more when the link is free. Never on a timer.
 */
import type { CompatAsked } from "./compat-read"
import { pairingOf } from "./index"
import type { HomeLinkState } from "./model"
import type { ServesEvent, ServesState } from "./serves-model"
import { INITIAL_SERVES, servesOf, step } from "./serves-model"

export type ServesPorts = {
  /** One ask of home, for the version this build was made against. */
  read: () => Promise<CompatAsked>
  now: () => number
}

export type ServesRun = {
  getSnapshot: () => ServesState
  subscribe: (listener: () => void) => () => void
  /** Asks, unless the model says not now; resolves to how that ask ended. */
  ask: (
    why: Extract<ServesEvent, { type: "ask" }>["why"]
  ) => Promise<CompatAsked["kind"] | null>
  /** The phone is no longer paired: what home said is forgotten. */
  forget: () => void
}

export function createServes(ports: ServesPorts): ServesRun {
  let state = INITIAL_SERVES
  // Moves when the pairing is forgotten, so an answer from before it drops.
  let generation = 0
  const listeners = new Set<() => void>()
  const dispatch = (event: ServesEvent): void => {
    const next = step(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async ask(why): Promise<CompatAsked["kind"] | null> {
      const before = state
      dispatch({ type: "ask", why, at: ports.now() })
      if (state === before) return null
      const asked = generation
      const answered = await ports.read()
      if (asked !== generation) return null
      if (answered.kind === "answered") {
        dispatch({ type: "answered", serves: servesOf(answered.answer) })
      } else if (answered.kind === "unpaired") {
        dispatch({ type: "unpaired" })
      } else {
        dispatch({ type: "unanswered" })
      }
      return answered.kind
    },
    forget(): void {
      generation += 1
      dispatch({ type: "unpaired" })
    },
  }
}

/** What the watch hears: the link, and whether the app is in front. */
export type ServesWatchPorts = {
  link: {
    getSnapshot: () => HomeLinkState
    subscribe: (listener: () => void) => () => void
    onMissing: (listener: () => void) => () => void
  }
  doc: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >
}

/** Asks `serves` at its moments until the returned unsubscribe is called. */
export function watchServes(
  serves: ServesRun,
  { link, doc }: ServesWatchPorts
): () => void {
  let pairing = pairingOf(link.getSnapshot())
  // The last ask was turned away by the link's other read.
  let owed = false
  const ask = (why: "start" | "front" | "missing"): void => {
    if (pairing === null || doc.visibilityState !== "visible") return
    void serves.ask(why).then((ended) => {
      if (ended !== null) owed = ended === "busy"
    })
  }

  const onLink = (): void => {
    const state = link.getSnapshot()
    const now = pairingOf(state)
    if (now !== pairing) {
      pairing = now
      if (now === null) serves.forget()
      else ask("start")
    } else if (owed && state.activity.kind === "idle") {
      owed = false
      ask("start")
    }
  }
  const onFront = (): void => {
    ask("front")
  }
  const onMissing = (): void => {
    ask("missing")
  }

  const unsubscribeLink = link.subscribe(onLink)
  const unsubscribeMissing = link.onMissing(onMissing)
  doc.addEventListener("visibilitychange", onFront)
  ask("start")
  return () => {
    unsubscribeLink()
    unsubscribeMissing()
    doc.removeEventListener("visibilitychange", onFront)
  }
}
