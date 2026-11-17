/**
 * Where a render stands on home's conveyor (#2899): the stations every
 * video moves along, named as Studio's takes conveyor names its own
 * (pizza names, #2876; call C139), and what home's board says of each row,
 * read as a station. Pure, so every reading is held by a test; no state
 * name, worker term or log line reaches the screen, only these words.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Now, RenderFailed } from "./model"
import { refusalOf } from "./model"

/** The line every render moves along, in order. */
export const STATIONS = ["line", "room", "oven", "boxing", "ready"] as const

export type StationId = (typeof STATIONS)[number]

/** Where a render sits for now beside the line, rather than on it. */
export type Aside = "counter" | "burnt" | "tooBigForOven" | "tooBigForBox"

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
    tooBigForOven: "Too big for the oven",
    tooBigForBox: "Too big for the box",
  } satisfies Record<Aside, string>,
  /** What the worker is doing in the oven, where home says. */
  recording: (scene: number, scenes: number): string =>
    `Recording scene ${String(scene)} of ${String(scenes)}.`,
  /** The scene, where home doesn't say of how many. */
  recordingAt: (scene: number): string => `Recording scene ${String(scene)}.`,
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
 * it records, of how many where home knows (a recorder from before it says
 * `scenes <n>` doesn't), or that it is putting them together.
 */
export function stationLine(now: Now): string | null {
  const progress = now.progress
  if (progress === null || progress === undefined) return null
  if (progress.station === ASSEMBLING) return CONVEYOR_WORDS.assembling
  if (progress.station !== RECORDING || progress.scene === null) return null
  if (progress.scenes === null)
    return CONVEYOR_WORDS.recordingAt(progress.scene)
  return progress.scene <= progress.scenes
    ? CONVEYOR_WORDS.recording(progress.scene, progress.scenes)
    : null
}

/** The station a waiting or finished row on the board is at. */
export const ROW_TAGS = {
  waiting: CONVEYOR_WORDS.stations.line,
  done: CONVEYOR_WORDS.stations.ready,
} as const

/**
 * The side track a failed row sits on (C502): one the render policy refused
 * was never burnt, it didn't fit, before the oven (too long) or in the box
 * (too large); any other failure is burnt, as before.
 */
export function failedAside(failed: RenderFailed): Aside {
  const refusal = refusalOf(failed)
  if (refusal === null) return "burnt"
  switch (refusal.kind) {
    case "too-long": {
      return "tooBigForOven"
    }
    case "too-large": {
      return "tooBigForBox"
    }
    default: {
      return assertNever(refusal)
    }
  }
}
