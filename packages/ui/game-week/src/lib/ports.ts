/**
 * What the recorder needs from outside itself, apart from the microphone and
 * the clock: where bites are kept until home holds them, what of them is
 * still on the phone, and the person's own choices.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { isRecord, openRecord, writeRecord } from "@some-ui/core-utils"

import type { KeptBite } from "./bite"
import type { ModeId } from "./modes"
import { DEFAULT_MODE, isModeId } from "./modes"

/** What became of an answer: noted, or too late, the bite already on its way. */
type AmendOutcome = "noted" | "on-its-way"

/**
 * Where bites wait on the phone until home holds them (GW3). Calls run in
 * the order they are made, so an `amend` or `undo` made right after a
 * `keep` finds the bite. Every call rejects, changing nothing, when it
 * cannot do what it says. Nothing here lets a bite go but `undo`, and that
 * only while the bite is held back.
 *
 * A bite `keep` rejects is held by the store and tried again; `amend`,
 * `release` and `undo` reach it there, and `isKept` turns true, with the
 * listeners called, once a try succeeds.
 */
export type BiteStore = {
  /**
   * Keeps `bite` and its audio, both or neither, held back until
   * `bite.holdUntil`. Rejects when it could not, and holds the bite to try
   * again.
   */
  keep: (bite: KeptBite, audio: Blob) => Promise<void>
  /**
   * Says again what a held-back bite is about, held back until `holdUntil`.
   * Resolves `"on-its-way"`, changing nothing, once the bite is no longer
   * held back.
   */
  amend: (
    id: string,
    fields: Readonly<Record<string, string>>,
    holdUntil: number
  ) => Promise<AmendOutcome>
  /** Lets a held-back bite start on its way home now. */
  release: (id: string) => Promise<void>
  /** Throws a held-back bite away; rejects once it is no longer held back. */
  undo: (id: string) => Promise<void>
  /** Whether the bite `id` is kept on this phone, not only held to try again. */
  isKept: (id: string) => boolean
  /** Calls `listener` after each change to what is kept; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

/** What of the kept bites is still only on this phone, in the person's terms. */
export type OutboxView = {
  /**
   * Recorded here but not kept yet: the phone's storage refused them, and
   * the app holds them and tries again while it is open.
   */
  readonly notKept: number
  /** Kept here, not yet held by home. */
  readonly waiting: number
  /** Home said it can't take these; each stays on this phone. */
  readonly refused: number
  /** Kept on home; this phone lets their sound go. */
  readonly onHome: number
  /** When home first held one of `onHome`, in ms since the epoch; null for none. */
  readonly onHomeSince: number | null
  /** Whether this phone sends voice notes home at all. */
  readonly sending: boolean
}

export type OutboxPort = {
  getSnapshot: () => OutboxView
  subscribe: (listener: () => void) => () => void
}

/** The person's choices on this screen: a convenience, kept per phone. */
export type Prefs = {
  readonly mode: ModeId
  /** The game last picked, if any. */
  readonly gameId: string | null
  /** Games the person says they are not watching; every other one, they are. */
  readonly notWatching: ReadonlyArray<string>
}

export const INITIAL_PREFS: Prefs = {
  mode: DEFAULT_MODE,
  gameId: null,
  notWatching: [],
}

export type PrefsPort = {
  read: () => Prefs
  save: (prefs: Prefs) => void
}

const PREFS_KEY = "some-ui:game-week.prefs"
const PREFS_QUARANTINE = "some-ui:game-week.prefs.unreadable."

const isString = (value: unknown): value is string => typeof value === "string"

/** The stored choices, or null for a value this build cannot read. */
export function parsePrefs(raw: string): Prefs | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !isRecord(value) ||
    !isModeId(value.mode) ||
    !(value.gameId === null || isString(value.gameId)) ||
    !Array.isArray(value.notWatching) ||
    !value.notWatching.every(isString)
  ) {
    return null
  }
  return {
    mode: value.mode,
    gameId: value.gameId,
    notWatching: value.notWatching,
  }
}

/**
 * The choices in `storage`; without it (or with storage that throws) they
 * last as long as the page.
 */
export function storedPrefs(storage: KeyedStorage | null): PrefsPort {
  let memory = INITIAL_PREFS
  return {
    read(): Prefs {
      if (storage === null) return memory
      const opened = openRecord(
        storage,
        PREFS_KEY,
        parsePrefs,
        PREFS_QUARANTINE
      )
      return opened.kind === "kept" ? opened.value : memory
    },
    save(prefs): void {
      memory = prefs
      if (storage !== null)
        writeRecord(storage, PREFS_KEY, JSON.stringify(prefs), parsePrefs)
    },
  }
}
