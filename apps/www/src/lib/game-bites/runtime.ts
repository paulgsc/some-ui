/**
 * The game bites on this phone (GW3), as one store per page load: the
 * record (`./model`) in this device's storage, the audio on a shelf of its
 * own with no cap of its own (only the device's room bounds it), and the
 * `BiteStore` port the recorder keeps bites through.
 *
 * A bite counts as kept only once both are written: the audio first, then
 * the record that names it, and audio the record could not name is taken
 * back. A bite the phone could not keep is held here, by the store and not
 * by the screen that recorded it, and tried again on a timer and whenever
 * the page comes back, for as long as the page is loaded (`unkept`); Undo,
 * and what it was about, apply to it as they do to a kept one, and the
 * listeners hear when a try keeps it (`isKept`). Calls run one after
 * another, in the order made.
 *
 * Nothing here lets a bite go but Undo while it is held back, and no audio
 * goes but that of a bite the record says home holds (`letGo`): there is
 * no sweep. The record lives in
 * this device's storage and the audio in IndexedDB, so a keep cannot write
 * both in one transaction; the bite is noted (`KEEPING_KEY`) before its
 * audio is written, and a launch after the app was killed between the two
 * writes adds it to the record from that note (`recover`). Audio no record
 * or note names stays on the shelf. Once home holds a bite (its voice note
 * and `game_bite` row, kept for good), the record notes since when and the
 * bite's audio leaves the phone; the record of the bite stays (owner,
 * 2026-10-29, #2080; docs/discard-sites.md). An unreadable record is moved
 * aside, never written over, and lets nothing go.
 *
 * The store wakes itself when the earliest hold runs out, so the voice lane
 * copies a bite whose Undo closed with nobody on the screen.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import type { BiteStore, KeptBite } from "@some-ui/game-week"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { BlobShelf } from "@some-ui/voice-capture"

import type { GameBitesEvent, PhoneBite } from "./model"
import { isReady, parseGameBites, stepGameBites } from "./model"

const STORAGE_KEY = "some-ui:game-bites"
const QUARANTINE_PREFIX = "some-ui:game-bites.unreadable."
/** The bites whose audio is being written, not yet in the record. */
const KEEPING_KEY = "some-ui:game-bites.keeping"
const KEEPING_QUARANTINE = "some-ui:game-bites.keeping.unreadable."

/** How long a bite the phone could not keep waits before another try. */
export const RETRY_MS = 30_000

export type GameBitesPorts = {
  storage: KeyedStorage | null
  shelf: BlobShelf
  /** Milliseconds since the epoch. */
  now: () => number
  /** Runs `run` once, `ms` from now; returns the cancel. */
  after: (ms: number, run: () => void) => () => void
  /**
   * Calls `listener` with whether the page is hidden now, then on each
   * change. Kept for the page load.
   */
  onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type GameBites = BiteStore & {
  getSnapshot: () => ReadonlyArray<PhoneBite>
  /** The bites that may start on their way home now, and home doesn't hold. */
  ready: () => ReadonlyArray<KeptBite>
  /**
   * Notes since when home holds each of `held` this record has on its way,
   * then lets the audio of every bite home holds go. Failures go to the
   * log; the next call tries again.
   */
  letGo: (held: ReadonlySet<string>) => Promise<void>
  /** Bites the phone could not keep yet, held by this page load. */
  unkept: () => number
  audio: (id: string) => Promise<Blob | null>
}

class BiteRefusedError extends Error {
  readonly why: string

  constructor(why: string) {
    super(`game bite not changed: ${why}`)
    this.name = "BiteRefusedError"
    this.why = why
  }
}

type Held = { bite: KeptBite; audio: Blob }

export function createGameBites(ports: GameBitesPorts): GameBites {
  const { storage, shelf } = ports
  const opened =
    storage === null
      ? null
      : openRecord(storage, STORAGE_KEY, parseGameBites, QUARANTINE_PREFIX)
  let bites: ReadonlyArray<PhoneBite> =
    opened?.kind === "kept" ? opened.value : []
  // Storage that threw, or a record that could not be moved aside, is
  // written to by no one: a keep then fails, and the bite is held here.
  const writable = storage !== null && opened?.kind !== "unreadable"
  const listeners = new Set<() => void>()
  let held: ReadonlyArray<Held> = []
  let queue: Promise<unknown> = Promise.resolve()
  let cancelWake: (() => void) | null = null
  let cancelRetry: (() => void) | null = null
  /** Bites whose audio this page load has already let go. */
  const letGone = new Set<string>()

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  /** Runs `work` after every call made before it. */
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = queue.then(work, work)
    // Ignored: the caller of `work` gets its failure from `turn`; the queue
    // only waits for it to end.
    queue = turn.catch(() => undefined)
    return turn
  }

  /** Wakes the listeners when the earliest hold still to come runs out. */
  function wakeAtNextHold(): void {
    cancelWake?.()
    cancelWake = null
    const now = ports.now()
    const next = Math.min(
      ...bites.map(({ holdUntil }) => holdUntil).filter((at) => at > now)
    )
    if (!Number.isFinite(next)) return
    cancelWake = ports.after(next - now, () => {
      cancelWake = null
      notify()
      wakeAtNextHold()
    })
  }

  function writeBites(next: ReadonlyArray<PhoneBite>): void {
    if (
      !writable ||
      !writeRecord(storage, STORAGE_KEY, JSON.stringify(next), parseGameBites)
    ) {
      throw new BiteRefusedError("storage would not keep it")
    }
    bites = next
    wakeAtNextHold()
    notify()
  }

  /** Steps the record and writes it; throws, changing nothing, if either refuses. */
  function apply(event: GameBitesEvent): void {
    const next = stepGameBites(bites, event, ports.now())
    if (typeof next === "string") throw new BiteRefusedError(next)
    if (next !== bites) writeBites(next)
  }

  function readKeeping(): ReadonlyArray<KeptBite> {
    if (storage === null) return []
    const notes = openRecord(
      storage,
      KEEPING_KEY,
      parseGameBites,
      KEEPING_QUARANTINE
    )
    return notes.kind === "kept" ? notes.value : []
  }

  function writeKeeping(notes: ReadonlyArray<KeptBite>): boolean {
    return (
      storage !== null &&
      writeRecord(storage, KEEPING_KEY, JSON.stringify(notes), parseGameBites)
    )
  }

  /** Keeps `bite` and its audio, both or neither; throws if not. */
  async function keepNow(bite: KeptBite, audio: Blob): Promise<void> {
    if (!writable) throw new BiteRefusedError("storage would not keep it")
    if (bites.some(({ id }) => id === bite.id)) return
    const notes = readKeeping().filter(({ id }) => id !== bite.id)
    if (!writeKeeping([...notes, bite])) {
      throw new BiteRefusedError("storage would not keep it")
    }
    try {
      await shelf.put(bite.id, audio)
      try {
        apply({ kind: "kept", bite })
      } catch (error) {
        await shelf.remove([bite.id])
        throw error
      }
    } finally {
      writeKeeping(readKeeping().filter(({ id }) => id !== bite.id))
    }
  }

  /** Steps a bite held here; throws if it is not held or the step is refused. */
  function applyHeld(
    event: Exclude<GameBitesEvent, { kind: "kept" | "home-holds" }>
  ): void {
    const at = held.findIndex(({ bite }) => bite.id === event.id)
    if (at < 0) throw new BiteRefusedError("unknown")
    const entry = held[at]
    const next = stepGameBites([entry.bite], event, ports.now())
    if (typeof next === "string") throw new BiteRefusedError(next)
    held =
      next.length === 0
        ? held.filter((_, i) => i !== at)
        : held.map((each, i) => (i === at ? { ...each, bite: next[0] } : each))
    notify()
  }

  /** Applies `event` to the record, or to the held bite it names. */
  function change(
    event: Exclude<GameBitesEvent, { kind: "kept" | "home-holds" }>
  ): void {
    if (held.some(({ bite }) => bite.id === event.id)) applyHeld(event)
    else apply(event)
  }

  function retrySoon(): void {
    if (cancelRetry !== null || held.length === 0) return
    cancelRetry = ports.after(RETRY_MS, () => {
      cancelRetry = null
      retry()
    })
  }

  /** Tries every held bite again, in the order they were held. */
  function retry(): void {
    if (held.length === 0) return
    void inTurn(async () => {
      for (const { bite } of held) {
        // Read again each time: Undo or an answer may have changed it.
        const entry = held.find((each) => each.bite.id === bite.id)
        if (entry === undefined) continue
        try {
          await keepNow(entry.bite, entry.audio)
          held = held.filter((each) => each !== entry)
          notify()
        } catch {
          // Ignored: the bite stays held and is tried again (`retrySoon`),
          // and the screen already said it isn't kept.
        }
      }
    }).finally(retrySoon)
  }

  /**
   * Adds to the record every bite noted as being kept whose audio reached
   * the shelf: the app was stopped between the two writes. A note whose
   * audio never arrived names nothing to keep.
   */
  async function recover(): Promise<void> {
    const notes = readKeeping()
    if (!writable || notes.length === 0) return
    const shelved = new Set(await shelf.ids())
    const found = notes.filter(
      (bite) => shelved.has(bite.id) && !bites.some(({ id }) => id === bite.id)
    )
    if (found.length > 0) writeBites([...bites, ...found])
    writeKeeping([])
  }

  /**
   * Notes what home now holds, then lets go the audio of every bite home
   * holds that this page load has not let go yet, so a removal a stopped
   * app left undone is done at the next call. Only after the record says
   * so, and never a bite the record does not name.
   */
  async function letGoNow(held: ReadonlySet<string>): Promise<void> {
    if (!writable) return
    apply({ kind: "home-holds", ids: held })
    const ids = bites
      .filter((bite) => bite.homeSince !== undefined && !letGone.has(bite.id))
      .map(({ id }) => id)
    if (ids.length === 0) return
    await shelf.remove(ids)
    for (const id of ids) letGone.add(id)
  }

  inTurn(recover).catch((error: unknown) => {
    reportFailure({ port: "game bites recover", error: toIntentError(error) })
  })
  wakeAtNextHold()
  ports.onVisibility((hidden) => {
    if (hidden) return
    cancelRetry?.()
    cancelRetry = null
    retry()
  })

  return {
    getSnapshot: () => bites,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    ready: () =>
      bites.filter(
        (bite) => bite.homeSince === undefined && isReady(bite, ports.now())
      ),
    letGo: (held) =>
      inTurn(() => letGoNow(held)).catch((error: unknown) => {
        reportFailure({
          port: "game bites (let go once home holds them)",
          error: toIntentError(error),
        })
      }),
    unkept: () => held.length,
    isKept: (id) => bites.some((bite) => bite.id === id),
    audio: (id) => shelf.get(id),
    keep: (bite, audio) =>
      inTurn(async () => {
        try {
          await keepNow(bite, audio)
        } catch (error) {
          if (!held.some((each) => each.bite.id === bite.id)) {
            held = [...held, { bite, audio }]
            notify()
          }
          retrySoon()
          throw error
        }
      }),
    amend: (id, fields, holdUntil) =>
      inTurn(() => {
        try {
          change({ kind: "amended", id, fields, holdUntil })
        } catch (error) {
          if (error instanceof BiteRefusedError && error.why === "on-its-way")
            return Promise.resolve("on-its-way" as const)
          throw error
        }
        return Promise.resolve("noted" as const)
      }),
    release: (id) =>
      inTurn(() => {
        change({ kind: "released", id })
        return Promise.resolve()
      }),
    undo: (id) =>
      inTurn(async () => {
        if (held.some(({ bite }) => bite.id === id)) {
          applyHeld({ kind: "undone", id })
          return
        }
        apply({ kind: "undone", id })
        await shelf.remove([id])
      }),
  }
}
