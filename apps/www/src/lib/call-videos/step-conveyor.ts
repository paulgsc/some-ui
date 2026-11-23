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
import { CONVEYOR_WORDS } from "@/lib/renders/conveyor"

import type { Step, StepReason } from "./assets"
import { isStepReason } from "./assets"

/** A file's line: the render's, less Boxing. */
export const FILE_STATIONS = [
  "line",
  "room",
  "oven",
  "ready",
] as const satisfies ReadonlyArray<StationId>

export type FileStation = (typeof FILE_STATIONS)[number]

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

/** Where a step is on the line, or beside it, and what its line says. */
export type FileConveyor = {
  readonly at: FileStation
  readonly aside: { readonly aside: Aside; readonly why: StoppedWhy } | null
  /** When it was asked for, started on, or ended, where home says. */
  readonly when:
    | { readonly kind: "asked"; readonly at: string }
    | { readonly kind: "started"; readonly at: string }
    | { readonly kind: "ended"; readonly at: string }
    | null
}

/** Each reason home gives for a held step, as a side track and why. */
const HELD: {
  readonly [R in StepReason]: {
    readonly aside: Aside
    readonly why: StoppedWhy
  }
} = {
  "too-long": { aside: "tooBigForOven", why: "tooLong" },
  "too-large": { aside: "tooBigForBox", why: "tooLarge" },
  overflow: { aside: "spilledOver", why: "overflow" },
  "no-video": { aside: "counter", why: "noVideo" },
  "take-missing": { aside: "counter", why: "missingInput" },
  "take-unheard": { aside: "counter", why: "missingInput" },
  "snip-missing": { aside: "counter", why: "missingInput" },
  "snip-gone": { aside: "counter", why: "missingInput" },
  "clip-missing": { aside: "counter", why: "missingInput" },
  recorder: { aside: "burnt", why: "couldNot" },
}

/** Tried and not made: what a failed step, or a reason it can't read, says. */
const COULD_NOT = { aside: "burnt", why: "couldNot" } as const

/** Where a stopped step sits beside the line, and why. */
function stoppedOf(step: Step): {
  readonly aside: Aside
  readonly why: StoppedWhy
} {
  const { reason } = step
  if (step.state === "failed" || reason === undefined) return COULD_NOT
  return isStepReason(reason) ? HELD[reason] : COULD_NOT
}

/** Where `step` stands: a station, a side track where it stopped, a time. */
export function fileConveyor(step: Step): FileConveyor {
  switch (step.state) {
    case "missing":
    case "asked": {
      return {
        at: "line",
        aside: null,
        when:
          step.askedAt === undefined
            ? null
            : { kind: "asked", at: step.askedAt },
      }
    }
    case "waiting": {
      return {
        at: "room",
        aside: null,
        when:
          step.askedAt === undefined
            ? null
            : { kind: "asked", at: step.askedAt },
      }
    }
    case "rendering": {
      return {
        at: "oven",
        aside: null,
        when:
          step.startedAt === undefined
            ? null
            : { kind: "started", at: step.startedAt },
      }
    }
    case "done": {
      return {
        at: "ready",
        aside: null,
        when:
          step.endedAt === undefined
            ? null
            : { kind: "ended", at: step.endedAt },
      }
    }
    case "failed":
    case "blocked": {
      return {
        // Held before the oven: no step of it ran.
        at: step.startedAt === undefined ? "line" : "oven",
        aside: stoppedOf(step),
        when:
          step.endedAt === undefined
            ? null
            : { kind: "ended", at: step.endedAt },
      }
    }
    default: {
      return assertNever(step.state)
    }
  }
}
