/**
 * Where aph's entries and settings live while the app is open: in memory,
 * starting from the paper notes (`seed.ts`). Nothing is written anywhere, so
 * a reload starts over. That is deliberate for now: the screens' shape comes
 * first, and storage replaces this module's insides later without changing
 * what the screens read.
 *
 * Synchronous on purpose. Every change is a pure function of the current
 * value (`draft.ts`, `model.ts`), so there is no result that can arrive late
 * and nothing for React to coordinate; components read it through
 * `useSyncExternalStore`.
 */
import type { Commit, Draft } from "./draft"
import { commitDraft, keepsOnePlain, reviewEntry } from "./draft"
import type { AphSettings, Entry, Review } from "./model"
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
  review: (id: string, review: Review | null) => void
  /**
   * False, changing nothing, when the labels would leave a second plain
   * entry at the checkpoint (`keepsOnePlain`).
   */
  editEntry: (
    id: string,
    patch: Partial<Pick<Entry, "labels" | "note">>
  ) => boolean
  editSettings: (patch: Partial<AphSettings>) => void
}

export function createAphStore(initial: AphState): AphStore {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (next: AphState): void => {
    state = next
    for (const listener of listeners) listener()
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
      set({ ...state, entries: saved.entries })
      return saved.entries.find((e) => e.id === saved.id) ?? null
    },
    review: (id, review) =>
      set({ ...state, entries: reviewEntry(state.entries, id, review) }),
    editEntry: (id, patch): boolean => {
      if (
        patch.labels !== undefined &&
        !keepsOnePlain(state.entries, id, patch.labels)
      ) {
        return false
      }
      set({
        ...state,
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, ...patch } : e
        ),
      })
      return true
    },
    editSettings: (patch) =>
      set({ ...state, settings: { ...state.settings, ...patch } }),
  }
}

/** The app's one store, for as long as the page lives. */
export const aphStore = createAphStore({
  settings: SEED_SETTINGS,
  entries: SEED_ENTRIES,
})
