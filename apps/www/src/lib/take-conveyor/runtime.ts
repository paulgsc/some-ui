/**
 * The phone's moves of Studio's takes along the conveyor (CONVEYOR1, #2873):
 * one store per page load over its pure model (`./model`), its record
 * in this device's storage, and the port `lib/home-link/take-stations`
 * reads the moves owed to home through and answers them by. A move is made
 * only once storage kept it, so a move shown is one that reaches home, on
 * this run of the voice lane or a later one; away from home it waits there
 * as the lane's other sends do. Nothing here removes a move.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { jsonOf, openRecord, writeRecord } from "@some-ui/core-utils"
import type { LibraryStations } from "@some-ui/soundbites"

import type {
  ConveyorEvent,
  ConveyorState,
  HomeStation,
  MoveAsked,
  MoveRefused,
  StationMove,
  TakeStanding,
} from "./model"
import {
  homeStationOf,
  INITIAL_CONVEYOR,
  moveOf,
  movesOwed,
  parseConveyor,
  stationOf,
  stepConveyor,
} from "./model"
import { TAKE_CONVEYOR_WORDS } from "./words"

const STORAGE_KEY = "some-ui:take-conveyor"
const QUARANTINE_PREFIX = "some-ui:take-conveyor.unreadable."

const parse = (raw: string): ConveyorState | null => parseConveyor(jsonOf(raw))

export type TakeConveyorPorts = {
  readonly storage: KeyedStorage | null
  /** A new move's id, once per move. */
  readonly newId: () => string
  /** Now, as ISO 8601: when the owner moved it. */
  readonly now: () => string
}

/**
 * How home answered a move for good: kept, refused as it is, or made from a
 * station the take had already left.
 */
type MoveAnswer = "held" | "refused" | "stale"

/** What `lib/home-link/take-stations` reads and answers through. */
export type StationsPort = {
  readonly due: () => ReadonlyArray<StationMove>
  readonly answered: (answer: MoveAnswer, move: string) => void
}

/** How a move the owner asked for went. */
type MoveMade =
  | { readonly kind: "moved"; readonly move: StationMove }
  | { readonly kind: "refused"; readonly why: MoveRefused }
  /** This phone's storage wouldn't keep it, so nothing moved. */
  | { readonly kind: "unkept" }

export type TakeConveyor = {
  readonly getSnapshot: () => ConveyorState
  readonly subscribe: (listener: () => void) => () => void
  /** Where take `id` stands, given what home says of it; null off the conveyor. */
  readonly standing: (id: string, home: HomeStation) => TakeStanding | null
  /** Moves a take as the owner asked, once storage keeps the move. */
  readonly move: (asked: MoveAsked) => MoveMade
  readonly port: StationsPort
}

export function createTakeConveyor(ports: TakeConveyorPorts): TakeConveyor {
  const { storage } = ports
  const opened =
    storage === null
      ? null
      : openRecord(storage, STORAGE_KEY, parse, QUARANTINE_PREFIX)
  let state = opened?.kind === "kept" ? opened.value : INITIAL_CONVEYOR
  // Storage that threw is written to by no one: the record stays in memory.
  const writable = storage !== null && opened?.kind !== "unreadable"
  const listeners = new Set<() => void>()

  /**
   * Steps the record. A move is taken only once storage kept it; home's
   * answer is held in memory even when storage refused it, so the next
   * kept write carries it and until then the move is only sent again.
   */
  const apply = (event: ConveyorEvent): boolean => {
    const next = stepConveyor(state, event)
    if (next === state) return true
    const kept =
      writable && writeRecord(storage, STORAGE_KEY, JSON.stringify(next), parse)
    if (!kept && event.kind === "moved") return false
    state = next
    for (const listener of listeners) listener()
    return kept
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    standing: (id, home) => stationOf(id, home, state),
    move(asked): MoveMade {
      const made = moveOf(asked, ports.newId(), ports.now())
      if (made.kind === "refused") return made
      return apply({ kind: "moved", move: made.move })
        ? { kind: "moved", move: made.move }
        : { kind: "unkept" }
    },
    port: {
      due: () => movesOwed(state),
      answered(answer, move): void {
        apply({ kind: answer, move })
      },
    },
  }
}

/**
 * Takes on home's word for where each take stands (`LibraryStations`): home's
 * station, read only when it is one this phone knows, and any later move of
 * the phone's, in the conveyor's words.
 */
export const libraryStationsOf = (conveyor: TakeConveyor): LibraryStations => ({
  subscribe: conveyor.subscribe,
  getSnapshot: conveyor.getSnapshot,
  standing: (take): string | null => {
    const standing = conveyor.standing(take.id, homeStationOf(take))
    return standing === null ? null : TAKE_CONVEYOR_WORDS.standing(standing)
  },
})
