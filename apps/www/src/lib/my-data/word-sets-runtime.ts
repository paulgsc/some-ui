/**
 * My data's Korean word sets (MD7, #2496): the runtime that owns the phone's
 * word-set store, over `./word-sets`' pure step. The page reads the snapshot
 * and says what was pressed.
 *
 * - **The store is opened once,** on the first read; a later `open` or drag
 *   down reads it again, so a set added since shows.
 * - **Archive and Bring back are the owner's presses,** and nothing else
 *   calls them (C232). Each writes through the one store and reads it again,
 *   so the page shows what the phone kept, never what it was asked to keep.
 */
import type { PhoneWordSets } from "@some-ui/topik"

import type { WordSetsEvent, WordSetsSaid, WordSetsState } from "./word-sets"
import { READING, stepWordSets } from "./word-sets"

export type WordSetsPorts = {
  /** This phone's word sets; rejects when they can't be opened. */
  readonly open: () => Promise<PhoneWordSets>
  readonly now: () => Date
  /** Reports a store that couldn't be opened. */
  readonly failed: (error: unknown) => void
}

export type WordSetsPage = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => WordSetsState
  /** Reads the sets, on the page's open. */
  readonly open: () => void
  /** A drag down's read again (PULL1): rejects when they couldn't be read. */
  readonly checkAgain: () => Promise<void>
  readonly archive: (id: string) => void
  readonly bringBack: (id: string) => void
  /** The notice closed. */
  readonly dismiss: () => void
}

export function createWordSetsPage(ports: WordSetsPorts): WordSetsPage {
  let state: WordSetsState = READING
  let sets: Promise<PhoneWordSets> | null = null
  let held: PhoneWordSets | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: WordSetsEvent): void => {
    const next = stepWordSets(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const read = async (): Promise<void> => {
    sets ??= ports.open()
    try {
      held = await sets
    } catch (error) {
      sets = null
      ports.failed(error)
      dispatch({ type: "unread" })
      throw error
    }
    dispatch({ type: "read", list: held.list(ports.now()) })
  }

  const titleOf = (id: string): string | null => {
    if (state.kind !== "read") return null
    const { inUse, archived } = state.list
    return [...inUse, ...archived].find((row) => row.id === id)?.title ?? null
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    open(): void {
      // A notice from the last visit is over: the page opens on the list.
      dispatch({ type: "dismissed" })
      read().catch(() => {
        // Ignored: `read` reported it and the page says it as `unread`.
      })
    },
    checkAgain: () => read(),
    archive(id): void {
      const title = titleOf(id)
      if (held === null || title === null) return
      const kept = held.archive(id, ports.now().toISOString())
      dispatch({
        type: "did",
        list: held.list(ports.now()),
        said: kept ? { kind: "archived", id, title } : { kind: "notKept" },
      })
    },
    bringBack(id): void {
      const title = titleOf(id)
      if (held === null || title === null) return
      const kept = held.bringBack(id)
      const list = held.list(ports.now())
      const said: WordSetsSaid = kept
        ? { kind: "broughtBack", title }
        : list.room
          ? { kind: "notKept" }
          : { kind: "noRoom", limit: list.limit }
      dispatch({ type: "did", list, said })
    },
    dismiss(): void {
      dispatch({ type: "dismissed" })
    },
  }
}
