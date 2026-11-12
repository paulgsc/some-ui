/**
 * Where a render stands on home's conveyor (#2899): the stations every
 * video moves along, named as Studio's takes conveyor names its own
 * (pizza names, #2876; call C139), and what home's board says of each row,
 * read as a station. Pure, so every reading is held by a test; no state
 * name, worker term or log line reaches the screen, only these words.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Now } from "./model"

/** The line every render moves along, in order. */
export const STATIONS = ["line", "room", "oven", "boxing", "ready"] as const

export type StationId = (typeof STATIONS)[number]

/** Where a render sits for now beside the line, rather than on it. */
export type Aside = "counter" | "burnt"

export const CONVEYOR_WORDS = {
  label: "Where it is",
  stations: {
    line: "In line",
    room: "Waiting for an oven",
    oven: "In the oven",
    boxing: "Boxing",
    ready: "Ready for pickup",
  } satisfies Record<StationId, string>,
  asides: {
    counter: "Set on the counter",
    burnt: "Burnt",
  } satisfies Record<Aside, string>,
  /** What the worker is doing in the oven, where home says. */
  recording: (scene: number, scenes: number): string =>
    `Recording scene ${String(scene)} of ${String(scenes)}.`,
  assembling: "Putting the scenes together.",
} as const

/** The worker's words for its two stations in the oven. */
const RECORDING = "recording"
const ASSEMBLING = "assembling"

/** The station what home is making is at. */
export function nowStation(now: Now): StationId {
  switch (now.state) {
    case "waiting": {
      return "room"
    }
    case "rendering":
    case "paused": {
      return now.progress?.station === ASSEMBLING ? "boxing" : "oven"
    }
    case "finishing": {
      return "boxing"
    }
    default: {
      return assertNever(now.state)
    }
  }
}

/** The side track what home is making sits on, if any. */
export const nowAside = (now: Now): Aside | null =>
  now.state === "paused" ? "counter" : null

/**
 * What the worker is doing at its station, where home says: the scene
 * it records, of how many, or that it is putting them together.
 */
export function stationLine(now: Now): string | null {
  const progress = now.progress
  if (progress === null || progress === undefined) return null
  if (progress.station === ASSEMBLING) return CONVEYOR_WORDS.assembling
  return progress.station === RECORDING &&
    progress.scene !== null &&
    progress.scenes !== null &&
    progress.scene <= progress.scenes
    ? CONVEYOR_WORDS.recording(progress.scene, progress.scenes)
    : null
}

/** The station, or side track, a row on the board is at. */
export const ROW_TAGS = {
  waiting: CONVEYOR_WORDS.stations.line,
  done: CONVEYOR_WORDS.stations.ready,
  failed: CONVEYOR_WORDS.asides.burnt,
} as const
