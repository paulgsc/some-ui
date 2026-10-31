/**
 * Where aph's entries and settings live: in memory while the app is open,
 * and on the device (`stored.ts`) between launches, so a reload, a restart
 * or an update keeps them. The first launch starts from the paper notes
 * (`seed.ts`) and keeps them from then on.
 *
 * Or, once kept on home (`keepOnHome`, `home.ts`, which the app's home
 * link does on a paired phone's first run), on the paired home server: the
 * phone then keeps only the settings and what home has not confirmed (the
 * outbox), shows home's record once the app's home link has read it
 * (`pulled`), and lets go of each change home answers with as it is
 * (`sent`). The store does no I/O for that; it is told.
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
import type { HomeHeld, HomeRecord, Outbox, Receipt, Refusal } from "./home"
import {
  afterSend,
  outboxOf,
  recordChange,
  sameSettings,
  shown,
  startHome,
  unsentCount,
} from "./home"
import type { AphSettings, Entry, Review } from "./model"
import { breaches, violations } from "./model"
import { SEED_ENTRIES, SEED_SETTINGS } from "./seed"
import type { AphStorage } from "./stored"
import {
  deviceStorage,
  forgetDeviceRecord,
  openHome,
  openStored,
  writeHome,
  writeStored,
} from "./stored"

export type AphState = {
  settings: AphSettings
  entries: ReadonlyArray<Entry>
}

/** Where the record is kept, for the screens that say so. */
export type AphWhere =
  /** On this phone only. */
  | { readonly kind: "device" }
  | {
      readonly kind: "home"
      /** Home's record has been read since the app opened. */
      readonly pulled: boolean
      /** Changes waiting on this phone, refused ones included. */
      readonly unsent: number
      readonly refused: ReadonlyArray<Refusal>
      /** Waiting entries that conflict with home's record, so not shown. */
      readonly hidden: number
      /** Counts this phone's own changes, for whoever sends them. */
      readonly edits: number
    }

export type AphStore = {
  get: () => AphState
  subscribe: (listener: () => void) => () => void
  where: () => AphWhere
  /**
   * Keeps the record on home from now on: everything this phone holds waits
   * to be sent, and the device record is removed once that is kept. False,
   * changing nothing, when the phone would not keep it.
   */
  keepOnHome: () => boolean
  /** What waits to be sent to home; null when kept on this phone. */
  outbox: () => Outbox | null
  /** What a send to home learned (`afterSend`). */
  sent: (receipt: Receipt) => void
  /** Home's record, as read: shown from now on. False when it can't be. */
  pulled: (home: HomeHeld) => boolean
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
  const home = storage === null ? null : openHome(storage)
  let record: HomeRecord | null = null
  let writable = true
  let state: AphState
  let pulled = false
  let hidden = 0
  let edits = 0
  if (storage !== null && (home?.kind === "kept" || home?.kind === "moved")) {
    record =
      home.kind === "kept"
        ? home.record
        : {
            settings: initial.settings,
            settingsPending: false,
            pending: [],
            refused: [],
          }
    if (home.kind === "moved") writable = writeHome(storage, record)
    // Before home is read, the outbox alone: home's view of an empty record.
    const alone = shown(record, { settings: null, entries: [] })
    state = { settings: record.settings, entries: alone?.entries ?? [] }
    hidden = alone?.hidden ?? 0
  } else {
    const opened = storage === null ? null : openStored(storage)
    state = opened?.kind === "kept" ? opened.state : initial
    writable = opened?.kind !== "unreadable"
    if (storage !== null && opened?.kind === "empty" && writable) {
      writeStored(storage, state)
    }
  }

  const whereOf = (): AphWhere =>
    record === null
      ? { kind: "device" }
      : {
          kind: "home",
          pulled,
          unsent: unsentCount(record),
          refused: record.refused,
          hidden,
          edits,
        }
  let where = whereOf()
  const listeners = new Set<() => void>()
  const changed = (): void => {
    where = whereOf()
    for (const listener of listeners) listener()
  }

  /** Keeps `next` where the record lives: the device record, or the outbox. */
  const keep = (next: AphState): boolean => {
    if (storage === null) return true
    if (!writable) return false
    if (record === null) return writeStored(storage, next)
    const nextRecord = recordChange(record, state, next)
    if (nextRecord === record) return true
    if (!writeHome(storage, nextRecord)) return false
    record = nextRecord
    edits += 1
    return true
  }
  const set = (next: AphState): boolean => {
    if (violations(next.settings, next.entries).length > 0) return false
    if (breaches(state.entries, next.entries).length > 0) return false
    if (!keep(next)) return false
    state = next
    changed()
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
    where: () => where,
    keepOnHome: (): boolean => {
      if (record !== null) return true
      if (storage === null || !writable) return false
      const next = startHome(state.settings, state.entries)
      if (!writeHome(storage, next)) return false
      forgetDeviceRecord(storage)
      record = next
      edits += 1
      changed()
      return true
    },
    outbox: () => (record === null ? null : outboxOf(record)),
    sent: (receipt): void => {
      if (record === null) return
      const next = afterSend(record, receipt)
      // Unwritten, the phone keeps more than home needs: sent again, it is
      // answered unchanged. Never less.
      if (storage !== null && writable) writeHome(storage, next)
      record = next
      changed()
    },
    pulled: (held): boolean => {
      if (record === null) return false
      const view = shown(record, held)
      if (view === null) return false
      if (!sameSettings(view.settings, record.settings)) {
        const next = { ...record, settings: view.settings }
        if (storage !== null && writable) writeHome(storage, next)
        record = next
      }
      state = { settings: view.settings, entries: view.entries }
      pulled = true
      hidden = view.hidden
      changed()
      return true
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
