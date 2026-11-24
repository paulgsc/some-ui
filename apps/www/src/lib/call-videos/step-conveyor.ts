/**
 * Where a file asked of home stands, as the conveyor every render moves
 * along (ASSETS-R; the owner, 2026-11-22: "the same conveyor belt … the
 * conveyor step should be generic"): Studio's renders' own stations and side
 * tracks (`lib/renders/conveyor`), read from the file's `Step`, with a line
 * saying since when. Pure: every step reads as one station and one line, held
 * by a test, and no state name or reason reaches the screen.
 *
 * A file is made in one go, with no scenes to put together, so its line
 * skips Boxing: In line, Waiting for an oven, In the oven, Ready for pickup.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Aside, StationId } from "@/lib/renders/conveyor"
import { CONVEYOR_WORDS, refusalAside, STATIONS } from "@/lib/renders/conveyor"

import type { HeldReason, Step } from "./assets"
import { isHeldReason } from "./assets"

/** A file's line: the render's, less Boxing. */
type FileStation = Exclude<StationId, "boxing">

const FILE_STATIONS: ReadonlyArray<FileStation> = STATIONS.filter(
  (id): id is FileStation => id !== "boxing"
)

/** The strip's stations, in the render conveyor's own words. */
export const FILE_STRIP = FILE_STATIONS.map((id) => ({
  id,
  name: CONVEYOR_WORDS.stations[id],
}))

/** Where a stopped file sits beside the line, and why, in its own words. */
export type StoppedWhy =
  | "tooLong"
  | "tooLarge"
  | "overflow"
  | "noVideo"
  | "missingInput"
  | "couldNot"
  | "held"

/** Where a step is on the line, or beside it, and what its line says. */
export type FileConveyor = {
  readonly at: FileStation
  readonly aside: { readonly aside: Aside; readonly why: StoppedWhy } | null
  /** When it was asked for, started on, or ended, in Unix seconds, where home says. */
  readonly when:
    | { readonly kind: "asked"; readonly at: number }
    | { readonly kind: "started"; readonly at: number }
    | { readonly kind: "ended"; readonly at: number }
    | null
}

/** Each reason home gives for a held step, as a side track and why. */
const HELD: {
  readonly [R in HeldReason]: {
    readonly aside: Aside
    readonly why: StoppedWhy
  }
} = {
  "too-long": { aside: refusalAside("too-long"), why: "tooLong" },
  "too-large": { aside: refusalAside("too-large"), why: "tooLarge" },
  overflow: { aside: refusalAside("overflow"), why: "overflow" },
  "no-video": { aside: "counter", why: "noVideo" },
  "take-missing": { aside: "counter", why: "missingInput" },
  "take-unheard": { aside: "counter", why: "missingInput" },
  "snip-missing": { aside: "counter", why: "missingInput" },
  "snip-gone": { aside: "counter", why: "missingInput" },
  "page-missing": { aside: "counter", why: "missingInput" },
  "page-gone": { aside: "counter", why: "missingInput" },
  "walk-missing": { aside: "counter", why: "missingInput" },
  "walk-gone": { aside: "counter", why: "missingInput" },
  "clip-missing": { aside: "counter", why: "missingInput" },
  recorder: { aside: "burnt", why: "couldNot" },
}

/** Where a stopped step sits beside the line, and why. */
function stoppedOf(step: Step): {
  readonly aside: Aside
  readonly why: StoppedWhy
} {
  const { reason } = step
  if (reason !== undefined && isHeldReason(reason)) return HELD[reason]
  // A reason this phone doesn't know yet: tried and not made, or held until
  // something changes, as the state says.
  return step.state === "failed"
    ? { aside: "burnt", why: "couldNot" }
    : { aside: "counter", why: "held" }
}

/** A time home gave, as its kind of moment; none where home gave none. */
const stamp = (
  kind: "asked" | "started" | "ended",
  at: number | undefined
): FileConveyor["when"] => (at === undefined ? null : { kind, at })

/** Where `step` stands: a station, a side track where it stopped, a time. */
export function fileConveyor(step: Step): FileConveyor {
  switch (step.state) {
    case "missing":
    case "asked": {
      return { at: "line", aside: null, when: stamp("asked", step.askedAt) }
    }
    case "waiting": {
      return { at: "room", aside: null, when: stamp("asked", step.askedAt) }
    }
    case "rendering": {
      return {
        at: "oven",
        aside: null,
        when: stamp("started", step.startedAt),
      }
    }
    case "done": {
      return { at: "ready", aside: null, when: stamp("ended", step.endedAt) }
    }
    case "failed":
    case "blocked": {
      return {
        // Held before the oven: no step of it ran.
        at: step.startedAt === undefined ? "line" : "oven",
        aside: stoppedOf(step),
        when: stamp("ended", step.endedAt),
      }
    }
    default: {
      return assertNever(step.state)
    }
  }
}
