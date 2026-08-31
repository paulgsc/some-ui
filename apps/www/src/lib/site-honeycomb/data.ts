import {
  Cable,
  Cog,
  Compass,
  Cpu,
  Flame,
  FlaskConical,
  Hammer,
  HardHat,
  PackageIcon,
  PaintBucket,
  PanelsTopLeft,
  Ruler,
  ShieldCheck,
  SignpostBig,
  Truck,
  Wrench,
} from "lucide-react"

import type { SiteSummary, WorkBay } from "./types"

/**
 * The three decorative, non-interactive cells in the 19-cell (radius-2)
 * hex grid — derived from crates/some-hexagon's `hex_to_pixel` layout
 * (pointy-top, rows indexed by cube `z`), placed to match the row
 * distribution in the spec (§5.1): row 1 middle, row 2 last, row 4 first.
 */
export const EMPTY_CELL_IDS: ReadonlySet<string> = new Set([
  "hex_1_1_-2",
  "hex_2_-1_-1",
  "hex_-2_1_1",
])

/**
 * Bay inventory (spec §13), pinned one-to-one onto the 16 active cells of
 * the radius-2 grid in row-major reading order (top-left to bottom-right).
 * `hex_0_0_0` — the grid's true center — anchors "Compute Core".
 */
export const SITE_BAYS: ReadonlyArray<WorkBay> = [
  {
    id: "site-survey",
    cellId: "hex_0_2_-2",
    shortCode: "BAY-01",
    title: "Site Survey",
    description: "Measuring the lot before anything gets poured.",
    discipline: "structure",
    status: "surveying",
    crew: "Crew A",
    eta: "2 days",
    completion: 82,
    siteTexture: "Amber hazard",
    icon: Compass,
  },
  {
    id: "framing",
    cellId: "hex_2_0_-2",
    shortCode: "BAY-02",
    title: "Framing",
    description: "Load path skeleton going up bay by bay.",
    discipline: "structure",
    status: "welding",
    crew: "Crew B",
    eta: "5 days",
    completion: 46,
    siteTexture: "Raw steel",
    icon: Hammer,
  },
  {
    id: "foundation-rig",
    cellId: "hex_-1_2_-1",
    shortCode: "BAY-03",
    title: "Foundation Rig",
    description: "Piling equipment staged, first bore not yet cut.",
    discipline: "structure",
    status: "drilling",
    crew: "Crew C",
    eta: "9 days",
    completion: 28,
    siteTexture: "Bare aggregate",
    icon: HardHat,
  },
  {
    id: "conduit-run",
    cellId: "hex_0_1_-1",
    shortCode: "BAY-04",
    title: "Conduit Run",
    description: "Signal lines pulled through, curing before termination.",
    discipline: "wiring",
    status: "steady",
    crew: "Crew D",
    eta: "1 day",
    completion: 61,
    siteTexture: "Cyan conduit",
    icon: Cable,
  },
  {
    id: "gear-assembly",
    cellId: "hex_1_0_-1",
    shortCode: "BAY-05",
    title: "Gear Assembly",
    description: "Drivetrain going together under load-bearing rules.",
    discipline: "logic",
    status: "welding",
    crew: "Crew A",
    eta: "4 days",
    completion: 74,
    siteTexture: "Lime static",
    icon: Cog,
  },
  {
    id: "blueprints",
    cellId: "hex_-2_2_0",
    shortCode: "BAY-06",
    title: "Blueprints",
    description: "Final drafts nearly signed off by every discipline.",
    discipline: "design",
    status: "surveying",
    crew: "Crew B",
    eta: "1 day",
    completion: 90,
    siteTexture: "Magenta gloss",
    icon: Ruler,
  },
  {
    id: "wet-paint",
    cellId: "hex_-1_1_0",
    shortCode: "BAY-07",
    title: "Wet Paint",
    description: "First coat down, second coat waiting on cure time.",
    discipline: "design",
    status: "steady",
    crew: "Crew C",
    eta: "2 days",
    completion: 35,
    siteTexture: "Wet gloss",
    icon: PaintBucket,
  },
  {
    id: "compute-core",
    cellId: "hex_0_0_0",
    shortCode: "BAY-08",
    title: "Compute Core",
    description: "The rules engine every other bay eventually calls into.",
    discipline: "logic",
    status: "welding",
    crew: "Crew D",
    eta: "6 days",
    completion: 52,
    siteTexture: "Lime static",
    icon: Cpu,
  },
  {
    id: "test-bench",
    cellId: "hex_1_-1_0",
    shortCode: "BAY-09",
    title: "Test Bench",
    description: "Rig assembled, first fixtures not yet wired in.",
    discipline: "logic",
    status: "drilling",
    crew: "Crew A",
    eta: "8 days",
    completion: 19,
    siteTexture: "Bare aggregate",
    icon: FlaskConical,
  },
  {
    id: "crating",
    cellId: "hex_2_-2_0",
    shortCode: "BAY-10",
    title: "Crating",
    description: "On hold for a freight slot before the next batch ships.",
    discipline: "freight",
    status: "paused",
    crew: "Crew B",
    eta: "TBD",
    completion: 12,
    siteTexture: "Coral freight",
    icon: PackageIcon,
  },
  {
    id: "tooling",
    cellId: "hex_-1_0_1",
    shortCode: "BAY-11",
    title: "Tooling",
    description: "Fixtures set, curing in their final calibration.",
    discipline: "structure",
    status: "steady",
    crew: "Crew C",
    eta: "1 day",
    completion: 68,
    siteTexture: "Raw steel",
    icon: Wrench,
  },
  {
    id: "hot-works",
    cellId: "hex_0_-1_1",
    shortCode: "BAY-12",
    title: "Hot Works",
    description: "Seams going in under a permit-only weld window.",
    discipline: "structure",
    status: "welding",
    crew: "Crew D",
    eta: "3 days",
    completion: 41,
    siteTexture: "Raw steel",
    icon: Flame,
  },
  {
    id: "cladding",
    cellId: "hex_1_-2_1",
    shortCode: "BAY-13",
    title: "Cladding",
    description: "Anchor points marked, panels not yet on the wall.",
    discipline: "design",
    status: "drilling",
    crew: "Crew A",
    eta: "7 days",
    completion: 24,
    siteTexture: "Bare aggregate",
    icon: PanelsTopLeft,
  },
  {
    id: "haulage",
    cellId: "hex_-2_0_2",
    shortCode: "BAY-14",
    title: "Haulage",
    description: "Access road being cut for the next delivery window.",
    discipline: "freight",
    status: "drilling",
    crew: "Crew B",
    eta: "5 days",
    completion: 44,
    siteTexture: "Coral freight",
    icon: Truck,
  },
  {
    id: "safety-check",
    cellId: "hex_-1_-1_2",
    shortCode: "BAY-15",
    title: "Safety Check",
    description: "Walking the site before the next crew rotation clocks in.",
    discipline: "structure",
    status: "surveying",
    crew: "Crew C",
    eta: "1 day",
    completion: 77,
    siteTexture: "Amber hazard",
    icon: ShieldCheck,
  },
  {
    id: "detours",
    cellId: "hex_0_-2_2",
    shortCode: "BAY-16",
    title: "Detours",
    description: "Routing paused until the haulage road reopens.",
    discipline: "freight",
    status: "paused",
    crew: "Crew D",
    eta: "TBD",
    completion: 8,
    siteTexture: "Coral freight",
    icon: SignpostBig,
  },
]

/**
 * "Open" reproduces the observed demo's count (3 of 16) exactly under a
 * simple, documented rule: a bay that hasn't cleared its first fifth of
 * work yet reads as freshly opened rather than in progress. Keeping this a
 * derivation (not a stored field) means the summary can never drift from
 * the cells it's summarizing — spec §12's explicit requirement.
 */
const OPEN_BAY_COMPLETION_THRESHOLD = 20

export function deriveSiteSummary(
  bays: ReadonlyArray<WorkBay> = SITE_BAYS
): SiteSummary {
  const totalCompletion = bays.length
    ? Math.round(
        bays.reduce((sum, bay) => sum + bay.completion, 0) / bays.length
      )
    : 0
  const openBays = bays.filter(
    (bay) => bay.completion < OPEN_BAY_COMPLETION_THRESHOLD
  ).length

  return {
    totalCompletion,
    baysScheduled: bays.length,
    openBays,
  }
}
