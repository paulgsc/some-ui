/**
 * The shelf's two screens as plain state, outside React
 * (`docs/monorepo-boundaries.md`, "the component is not the coordinator"):
 * the list of what the learner kept (`createShelfList`) and the "Keep on
 * this account" control (`createShelfKeeper`). Each owns its shelf calls and
 * drops a result that lands while it is stopped or after a newer call of
 * its own, so a replay the learner walked away from never starts playing
 * (review, #1600). `KeptShelf` and `KeepOnShelf` (`components/ui/shelf`)
 * read their snapshots and only turn taps into calls.
 *
 * Making one calls nothing; `start()` begins (the list reads the listing)
 * and returns the stop. A stopped runtime can start again, which is what a
 * remount under `StrictMode` does.
 */

import { assertNever } from "some-ui-utils"

import type { ShelfFailure, ShelfItem, ShelfPort } from ".."
import { keepWithoutReplacing, shelfFailureOf } from ".."

type Listing =
  | { status: "loading" }
  | { status: "ready"; items: ReadonlyArray<ShelfItem>; cap: number }
  | { status: "failed"; failure: ShelfFailure }

export type ShelfListState = {
  listing: Listing
  /** The key a read or remove is in flight for; every row waits while one is. */
  busy: string | null
  /** Kept bodies that failed the activity's check: removable, never played. */
  unreadable: ReadonlySet<string>
  /** The last row call that failed, for the learner to try again. */
  rowError: { key: string; action: "read" | "remove" } | null
}

export type ShelfListEvent =
  | { type: "listed"; items: ReadonlyArray<ShelfItem>; cap: number }
  | { type: "listFailed"; failure: ShelfFailure }
  | { type: "started" }
  | { type: "relisting" }
  | { type: "rowStarted"; key: string }
  | { type: "played" }
  | { type: "unreadable"; key: string }
  | { type: "removed"; key: string }
  | { type: "rowFailed"; key: string; action: "read" | "remove" }

export const INITIAL_SHELF_LIST: ShelfListState = {
  listing: { status: "loading" },
  busy: null,
  unreadable: new Set(),
  rowError: null,
}

export function stepShelfList(
  state: ShelfListState,
  event: ShelfListEvent
): ShelfListState {
  switch (event.type) {
    case "listed": {
      return {
        ...state,
        listing: { status: "ready", items: event.items, cap: event.cap },
      }
    }
    case "listFailed": {
      return { ...state, listing: { status: "failed", failure: event.failure } }
    }
    case "started": {
      // A row call from a stopped run never lands: nothing waits on it.
      return { ...state, listing: { status: "loading" }, busy: null }
    }
    case "relisting": {
      return { ...state, listing: { status: "loading" } }
    }
    case "rowStarted": {
      return { ...state, busy: event.key, rowError: null }
    }
    case "played": {
      return { ...state, busy: null }
    }
    case "unreadable": {
      return {
        ...state,
        busy: null,
        unreadable: new Set(state.unreadable).add(event.key),
      }
    }
    case "removed": {
      return {
        ...state,
        busy: null,
        listing:
          state.listing.status === "ready"
            ? {
                ...state.listing,
                items: state.listing.items.filter(
                  (item) => item.key !== event.key
                ),
              }
            : state.listing,
      }
    }
    case "rowFailed": {
      return {
        ...state,
        busy: null,
        rowError: { key: event.key, action: event.action },
      }
    }
    default: {
      return assertNever(event)
    }
  }
}

export type ShelfRuntime<State> = {
  getSnapshot(): State
  subscribe(listener: () => void): () => void
  /** Begins; the returned stop drops every result still in flight. */
  start(): () => void
}

/** A snapshot, its listeners, and the run a result must belong to. */
function storeOf<State, Event>(
  initial: State,
  step: (state: State, event: Event) => State
): Pick<ShelfRuntime<State>, "getSnapshot" | "subscribe"> & {
  /** The current run, or null while stopped; a result from another is stale. */
  run(): number | null
  begin(): number
  end(): void
  apply(event: Event): void
} {
  let state = initial
  let runs = 0
  let current: number | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    run: () => current,
    begin: () => (current = ++runs),
    end: (): void => {
      current = null
    },
    apply: (event): void => {
      state = step(state, event)
      for (const listener of listeners) listener()
    },
  }
}

export type ShelfList = ShelfRuntime<ShelfListState> & {
  /** Lists again, after a listing that failed. */
  retry(): void
  /**
   * Reads `key` and hands the body to `open`, which plays it and says so, or
   * returns false when the activity's check refuses it. Never called once
   * stopped.
   */
  replay(key: string, open: (body: unknown) => boolean): void
  remove(key: string): void
}

/** The list of what the learner kept. Lists on start, then only on a tap. */
export function createShelfList(shelf: ShelfPort): ShelfList {
  const store = storeOf(INITIAL_SHELF_LIST, stepShelfList)
  let listing = 0

  /** Applies `event` if this run is still the current one. */
  const inRun =
    (run: number | null) =>
    (event: ShelfListEvent): void => {
      if (run !== null && run === store.run()) store.apply(event)
    }

  const list = (): void => {
    const call = ++listing
    const apply = inRun(store.run())
    shelf.list().then(
      ({ items, cap }) => {
        if (call === listing) apply({ type: "listed", items, cap })
      },
      (error: unknown) => {
        if (call === listing)
          apply({ type: "listFailed", failure: shelfFailureOf(error) })
      }
    )
  }

  /** One row call at a time, as the rows' disabled buttons already say. */
  const startRow = (key: string): boolean => {
    if (store.run() === null || store.getSnapshot().busy !== null) return false
    store.apply({ type: "rowStarted", key })
    return true
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    start: (): (() => void) => {
      store.begin()
      store.apply({ type: "started" })
      list()
      return store.end
    },
    retry: (): void => {
      if (store.run() === null) return
      store.apply({ type: "relisting" })
      list()
    },
    replay: (key, open): void => {
      if (!startRow(key)) return
      const run = store.run()
      shelf.read(key).then(
        (body) => {
          if (run !== store.run()) return
          store.apply(
            open(body) ? { type: "played" } : { type: "unreadable", key }
          )
        },
        () => inRun(run)({ type: "rowFailed", key, action: "read" })
      )
    },
    remove: (key): void => {
      if (!startRow(key)) return
      const apply = inRun(store.run())
      shelf.remove(key).then(
        () => apply({ type: "removed", key }),
        () => apply({ type: "rowFailed", key, action: "remove" })
      )
    },
  }
}

type Keeping =
  | { status: "idle" }
  | { status: "keeping" }
  | { status: "kept"; unchanged: boolean; key: string }
  | { status: "failed"; failure: ShelfFailure }

type KeepingEvent =
  | { type: "keeping" }
  | { type: "kept"; change: "kept" | "unchanged"; key: string }
  | { type: "failed"; failure: ShelfFailure }
  | { type: "stopped" }

function stepKeeping(state: Keeping, event: KeepingEvent): Keeping {
  switch (event.type) {
    case "keeping": {
      return { status: "keeping" }
    }
    case "kept": {
      return {
        status: "kept",
        unchanged: event.change === "unchanged",
        key: event.key,
      }
    }
    case "failed": {
      return { status: "failed", failure: event.failure }
    }
    case "stopped": {
      // A keep cut off by a stop is not known to have landed: ask again.
      return state.status === "keeping" ? { status: "idle" } : state
    }
    default: {
      return assertNever(event)
    }
  }
}

export type ShelfKeeper = ShelfRuntime<Keeping> & {
  /** Keeps `body` under `base` or a free `-N` of it (`keepWithoutReplacing`). */
  keep(base: string, body: string | ((key: string) => string)): void
}

/** "Keep on this account": the one caller of `ShelfPort.keep`, through `keepWithoutReplacing`. */
export function createShelfKeeper(shelf: ShelfPort): ShelfKeeper {
  const store = storeOf<Keeping, KeepingEvent>({ status: "idle" }, stepKeeping)
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    start: (): (() => void) => {
      store.begin()
      return (): void => {
        store.end()
        store.apply({ type: "stopped" })
      }
    },
    keep: (base, body): void => {
      const run = store.run()
      if (run === null || store.getSnapshot().status === "keeping") return
      store.apply({ type: "keeping" })
      const apply = (event: KeepingEvent): void => {
        if (run === store.run()) store.apply(event)
      }
      keepWithoutReplacing(shelf, base, body).then(
        ({ change, key }) => apply({ type: "kept", change, key }),
        (error: unknown) =>
          apply({ type: "failed", failure: shelfFailureOf(error) })
      )
    },
  }
}
