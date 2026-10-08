/**
 * Where aph's entries and settings live: in memory while the app is open,
 * and on the device (`stored.ts`) between launches, so a reload, a restart
 * or an update keeps them. The first launch starts from the paper notes
 * (`seed.ts`) and keeps them from then on.
 *
 * Every write is checked against `violations` (the state it leaves) and
 * `breaches` (the step it takes), both in model.ts, and refused, the state
 * left as it was, when it would break one: the rules live here, once, not
 * in each screen that edits. A change the device refuses to keep is refused
 * too, so what the screens show is always what a restart will show.
 *
 * Synchronous on purpose. Every change is a pure function of the current
 * value (`draft.ts`, `model.ts`), so there is no result that can arrive late
 * and nothing for React to coordinate; components read it through
 * `useSyncExternalStore`.
 */
import type { Commit, Draft } from "./draft"
import { commitDraft, reviewEntry } from "./draft"
import type { AphSettings, Entry, Review } from "./model"
import { breaches, violations } from "./model"
import { SEED_ENTRIES, SEED_SETTINGS } from "./seed"
import type { AphStorage } from "./stored"
import { deviceStorage, openStored, writeStored } from "./stored"

export type AphState = {
  settings: AphSettings
  entries: ReadonlyArray<Entry>
}

export type AphStore = {
  get: () => AphState
  subscribe: (listener: () => void) => () => void
  /** Saves the draft: the entry it landed on, or null with nothing to save. */
  save: (draft: Draft, commit: Commit) => Entry | null
  /** Each of these is false, changing nothing, when it would break a rule. */
  review: (id: string, review: Review | null) => boolean
  editEntry: (
    id: string,
    patch: Partial<Pick<Entry, "labels" | "note">>
  ) => boolean
  editSettings: (patch: Partial<AphSettings>) => boolean
}

/**
 * A store over `storage`, starting from what it keeps, or from `initial` when
 * it keeps nothing readable (which it then keeps). Without `storage`, memory
 * only.
 */
export function createAphStore(
  initial: AphState,
  storage: AphStorage | null = null
): AphStore {
  const opened = storage === null ? null : openStored(storage)
  let state = opened?.kind === "kept" ? opened.state : initial
  const keep = (next: AphState): boolean =>
    storage === null ||
    (opened?.kind !== "unreadable" && writeStored(storage, next))
  if (opened?.kind === "empty") keep(state)
  const listeners = new Set<() => void>()
  const set = (next: AphState): boolean => {
    if (violations(next.settings, next.entries).length > 0) return false
    if (breaches(state.entries, next.entries).length > 0) return false
    if (!keep(next)) return false
    state = next
    for (const listener of listeners) listener()
    return true
  }
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    save: (draft, commit): Entry | null => {
      const saved = commitDraft(state.settings, state.entries, draft, commit)
      if (saved === null) return null
      if (!set({ ...state, entries: saved.entries })) return null
      return saved.entries.find((e) => e.id === saved.id) ?? null
    },
    review: (id, review) =>
      set({ ...state, entries: reviewEntry(state.entries, id, review) }),
    editEntry: (id, patch): boolean =>
      set({
        ...state,
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, ...patch } : e
        ),
      }),
    editSettings: (patch) =>
      set({ ...state, settings: { ...state.settings, ...patch } }),
  }
}

/** The app's one store, kept in the WebView's `localStorage`. */
export const aphStore = createAphStore(
  { settings: SEED_SETTINGS, entries: SEED_ENTRIES },
  deviceStorage()
)
