/**
 * The game bites on this phone (GW3), as one store per page load: the
 * record (`./model`) in this device's storage, the audio on a shelf of its
 * own with no cap of its own (only the device's room bounds it), and the
 * `BiteStore` port the recorder keeps bites through.
 *
 * A bite counts as kept only once both are written: the audio first, then
 * the record that names it, and audio the record could not name is taken
 * back, so a keep either holds or rejects and the recorder holds the bite
 * for another try. Calls run one after another, in the order made.
 * Nothing here lets a bite go but Undo while it is held back; a bite home
 * holds stays on the phone too (the owner's call, CLAUDE.md "Never lose the
 * record"). An unreadable record is moved aside, never written over.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import type { BiteStore, KeptBite } from "@some-ui/game-week"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { BlobShelf } from "@some-ui/voice-capture"

import type { GameBitesEvent } from "./model"
import { isReady, parseGameBites, stepGameBites } from "./model"

const STORAGE_KEY = "some-ui:game-bites"
const QUARANTINE_PREFIX = "some-ui:game-bites.unreadable."

export type GameBitesPorts = {
  storage: KeyedStorage | null
  shelf: BlobShelf
  /** Milliseconds since the epoch. */
  now: () => number
}

export type GameBites = BiteStore & {
  getSnapshot: () => ReadonlyArray<KeptBite>
  subscribe: (listener: () => void) => () => void
  /** The bites that may start on their way home now. */
  ready: () => ReadonlyArray<KeptBite>
  audio: (id: string) => Promise<Blob | null>
  /** Clears audio the record names no bite for. Best effort. */
  sweep: () => void
}

class BiteRefusedError extends Error {
  constructor(why: string) {
    super(`game bite not changed: ${why}`)
    this.name = "BiteRefusedError"
  }
}

export function createGameBites(ports: GameBitesPorts): GameBites {
  const { storage, shelf } = ports
  const opened =
    storage === null
      ? null
      : openRecord(storage, STORAGE_KEY, parseGameBites, QUARANTINE_PREFIX)
  let bites: ReadonlyArray<KeptBite> =
    opened?.kind === "kept" ? opened.value : []
  // Storage that threw, or a record that could not be moved aside, is
  // written to by no one: a keep then rejects, and the bite stays held.
  const writable = storage !== null && opened?.kind !== "unreadable"
  const listeners = new Set<() => void>()
  let queue: Promise<unknown> = Promise.resolve()

  /** Runs `work` after every call made before it. */
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = queue.then(work, work)
    // Ignored: the caller of `work` gets its failure from `turn`; the queue
    // only waits for it to end.
    queue = turn.catch(() => undefined)
    return turn
  }

  /** Steps the record and writes it; throws, changing nothing, if either refuses. */
  function apply(event: GameBitesEvent): void {
    const next = stepGameBites(bites, event, ports.now())
    if (typeof next === "string") throw new BiteRefusedError(next)
    if (next === bites) return
    if (
      !writable ||
      !writeRecord(storage, STORAGE_KEY, JSON.stringify(next), parseGameBites)
    ) {
      throw new BiteRefusedError("storage would not keep it")
    }
    bites = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => bites,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    ready: () => bites.filter((bite) => isReady(bite, ports.now())),
    audio: (id) => shelf.get(id),
    keep: (bite, audio) =>
      inTurn(async () => {
        if (!writable) throw new BiteRefusedError("storage would not keep it")
        await shelf.put(bite.id, audio)
        try {
          apply({ kind: "kept", bite })
        } catch (error) {
          await shelf.remove([bite.id])
          throw error
        }
      }),
    amend: (id, fields, holdUntil) =>
      inTurn(() => {
        apply({ kind: "amended", id, fields, holdUntil })
        return Promise.resolve()
      }),
    release: (id) =>
      inTurn(() => {
        apply({ kind: "released", id })
        return Promise.resolve()
      }),
    undo: (id) =>
      inTurn(async () => {
        apply({ kind: "undone", id })
        await shelf.remove([id])
      }),
    sweep(): void {
      void inTurn(async () => {
        const named = new Set(bites.map(({ id }) => id))
        const ids = await shelf.ids()
        await shelf.remove(ids.filter((id) => !named.has(id)))
      }).catch((error: unknown) => {
        reportFailure({ port: "game bites sweep", error: toIntentError(error) })
      })
    },
  }
}
