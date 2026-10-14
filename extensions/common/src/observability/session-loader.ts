/**
 * The load coordinator behind a session-picker debug page: which session is
 * selected, which bundle is loaded, and which of several overlapping loads
 * gets to commit.
 *
 * The page owns rendering and reads this state through the accessors; this
 * owns every write to it.
 */

import type { CompactionFailure, IndexedEntry } from "./session-index"

export type SessionLoaderPorts<E extends IndexedEntry, B> = {
  /**
   * The session list, newest first. Called on every load. A debug page
   * passes its index's `compact`, so opening or refreshing the page also
   * enforces the cap and sweeps orphans; a `"survey"` failure is shown as an
   * error, a `"removal"` failure still lists.
   */
  readonly list: () => Promise<{
    readonly entries: ReadonlyArray<E>
    readonly failure?: CompactionFailure
  }>
  /** The session's bundle, or undefined when none is stored. */
  readonly loadBundle: (sessionId: string) => Promise<B | undefined>
  /** Repaint from the accessors. */
  readonly render: () => void | Promise<void>
}

export type SessionLoader<E extends IndexedEntry, B> = {
  readonly sessions: ReadonlyArray<E>
  readonly selectedSessionId: string | undefined
  /** The selected session's bundle, once its read has landed. */
  readonly bundle: B | undefined
  /** The selected session's read has landed, whether or not it found one. */
  readonly settled: boolean
  readonly loadError: string | undefined
  /**
   * Re-list the sessions and load the selected one's bundle.
   * `pickMostRecent` selects the newest ("Refresh sessions"); otherwise the
   * selection is kept while it is still listed.
   */
  load(pickMostRecent?: boolean): Promise<void>
  /**
   * The picker changed: drop the old bundle and repaint before the read
   * starts, so nothing can show or export one session under another's name.
   */
  select(sessionId: string | undefined): Promise<void>
}

/**
 * Which session to show, given a freshly read index. Pure, so `load` can
 * commit it only after its token check.
 */
function nextSelection(
  index: ReadonlyArray<IndexedEntry>,
  pickMostRecent: boolean,
  current: string | undefined
): string | undefined {
  if (
    pickMostRecent ||
    current === undefined ||
    !index.some((s) => s.sessionId === current)
  ) {
    return index[0]?.sessionId
  }
  return current
}

/**
 * Two loads can be in flight at once (a fast double-change of the picker is
 * enough), and their reads need not settle in the order they started. So
 * `loadToken` gates every write, not just every render: a superseded load
 * leaves the state exactly as it found it. The rule `load` keeps is that
 * nothing is assigned between an `await` and the token check after it.
 */
export function createSessionLoader<E extends IndexedEntry, B>(
  ports: SessionLoaderPorts<E, B>
): SessionLoader<E, B> {
  let sessions: ReadonlyArray<E> = []
  let selectedSessionId: string | undefined
  let bundle: B | undefined
  /** Which session `bundle` came from; Export names the file after it. */
  let loadedSessionId: string | undefined
  let loadToken = 0
  let loadError: string | undefined

  function clearLoadedBundle(): void {
    bundle = undefined
    loadedSessionId = undefined
  }

  async function load(pickMostRecent = false): Promise<void> {
    const token = ++loadToken
    // Repaint away a stale error panel, but only then: an unconditional
    // render would flash the page on every refresh.
    const hadError = loadError !== undefined
    loadError = undefined
    if (hadError) await ports.render()
    try {
      const { entries: index, failure } = await ports.list()
      if (token !== loadToken) return
      if (failure?.stage === "survey") {
        throw new Error(`Could not list sessions: ${failure.message}`)
      }
      sessions = [...index]
      selectedSessionId = nextSelection(
        index,
        pickMostRecent,
        selectedSessionId
      )
      if (selectedSessionId !== loadedSessionId) {
        clearLoadedBundle()
        await ports.render()
        if (token !== loadToken) return
      }
      const next = selectedSessionId
        ? await ports.loadBundle(selectedSessionId)
        : undefined
      if (token !== loadToken) return
      bundle = next
      loadedSessionId = selectedSessionId
      await ports.render()
    } catch (e) {
      if (token !== loadToken) return
      loadError = e instanceof Error ? e.message : String(e)
      await ports.render()
    }
  }

  async function select(sessionId: string | undefined): Promise<void> {
    selectedSessionId = sessionId
    clearLoadedBundle()
    // Started together, as the picker always did: `load` takes its token
    // synchronously, superseding any load already in flight.
    await Promise.all([ports.render(), load()])
  }

  return {
    get sessions(): ReadonlyArray<E> {
      return sessions
    },
    get selectedSessionId(): string | undefined {
      return selectedSessionId
    },
    get bundle(): B | undefined {
      return bundle
    },
    get settled(): boolean {
      return (
        selectedSessionId !== undefined && loadedSessionId === selectedSessionId
      )
    },
    get loadError(): string | undefined {
      return loadError
    },
    load,
    select,
  }
}
