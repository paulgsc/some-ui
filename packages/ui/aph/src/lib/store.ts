/**
 * Where aph's entries and settings live while the app is open: in memory,
 * starting from the paper notes (`seed.ts`). Nothing is written anywhere, so
 * a reload starts over. That is deliberate for now: the screens' shape comes
 * first, and storage replaces this module's insides later without changing
 * what the screens read.
 *
 * Every write is checked against `violations` (the state it leaves) and
 * `breaches` (the step it takes), both in model.ts, and refused, the state
 * left as it was, when it would break one: the rules live here, once, not
 * in each screen that edits.
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

export function createAphStore(initial: AphState): AphStore {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (next: AphState): boolean => {
    if (violations(next.settings, next.entries).length > 0) return false
    if (breaches(state.entries, next.entries).length > 0) return false
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

/** The app's one store, for as long as the page lives. */
export const aphStore = createAphStore({
  settings: SEED_SETTINGS,
  entries: SEED_ENTRIES,
})
