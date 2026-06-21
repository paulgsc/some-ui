import type { RailChip } from "@conveyor/components/control-rail"
import { ControlRail } from "@conveyor/components/control-rail"
import type { ManifestSegment } from "@conveyor/components/manifest-ticker"
import { ManifestTicker } from "@conveyor/components/manifest-ticker"

/**
 * buildConveyorZone — thin assembler that stacks the instrumentation chrome
 * (ControlRail → ManifestTicker) above a belt mount point, matching the intent's
 * "zone" (rail → manifest → belt). Pure view composition: it wires existing
 * components and returns the belt mount for ConveyorEngine to render into. No
 * business logic, no scheduler/WASM wiring — chip/segment values are props
 * (typed seams for a later logic-layer issue).
 */

export type ConveyorZoneOptions = {
  railId?: string
  railChips?: ReadonlyArray<RailChip>
  manifestSegments?: ReadonlyArray<ManifestSegment>
}

export type ConveyorZone = {
  /** Zone wrapper to append to the shadow root. */
  readonly root: HTMLElement
  /** Where ConveyorEngine mounts the belt/strip. */
  readonly beltMount: HTMLElement
}

const DEFAULT_CHIPS: ReadonlyArray<RailChip> = [
  { label: "scheduler", value: "running", tone: "live", dot: true },
  { label: "wasm", value: "✓ loaded", tone: "live" },
  { label: "window", value: "9.0s" },
]

export function buildConveyorZone(
  opts: ConveyorZoneOptions = {}
): ConveyorZone {
  const root = document.createElement("div")
  // The overlay stays click-through; only the cubes opt back into pointer events.
  root.className = "sc-zone pointer-events-none flex w-full flex-col"

  // HUD chrome, centred to the belt channel width above the full-width strip.
  const chrome = document.createElement("div")
  chrome.className = "mx-auto w-[min(1180px,92vw)]"
  chrome.append(
    ControlRail({ id: opts.railId, chips: opts.railChips ?? DEFAULT_CHIPS })
  )
  if (opts.manifestSegments && opts.manifestSegments.length > 0) {
    chrome.append(ManifestTicker({ segments: opts.manifestSegments }))
  }
  root.append(chrome)

  const beltMount = document.createElement("div")
  beltMount.className = "w-full"
  root.append(beltMount)

  return { root, beltMount }
}
