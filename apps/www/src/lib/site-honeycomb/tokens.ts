import type { BayStatus, Discipline } from "./types"

export type DisciplineToken = {
  /** User-facing label. Note the naming nuance from the spec: the
   * user-facing "Finish" category is the `design` discipline internally. */
  label: string
  description: string
  /** Accent as an oklch() string, matched for perceived brightness across
   * all five categories per spec §6/§18. */
  accent: string
}

export const DISCIPLINE_TOKENS: Readonly<Record<Discipline, DisciplineToken>> =
  {
    structure: {
      label: "Structure",
      description: "Framing, load paths, scaffolding",
      accent: "oklch(0.82 0.17 80)",
    },
    wiring: {
      label: "Wiring",
      description: "Signals, sockets, plumbing of data",
      accent: "oklch(0.82 0.14 195)",
    },
    design: {
      label: "Finish",
      description: "Surfaces, type, colour, polish",
      accent: "oklch(0.76 0.18 345)",
    },
    logic: {
      label: "Logic",
      description: "Machinery, rules, computation",
      accent: "oklch(0.79 0.17 140)",
    },
    freight: {
      label: "Freight",
      description: "Shipping, packing, delivery",
      accent: "oklch(0.75 0.16 35)",
    },
  }

export const DISCIPLINE_ORDER: ReadonlyArray<Discipline> = [
  "structure",
  "wiring",
  "design",
  "logic",
  "freight",
]

export type StatusToken = {
  label: string
  /** CSS class applied to the status icon; see site-honeycomb.css for the
   * keyframes. Ambient motion only — never the sole carrier of meaning,
   * the accessible name always spells the status out too. */
  motionClass: string
}

export const STATUS_TOKENS: Readonly<Record<BayStatus, StatusToken>> = {
  surveying: { label: "Surveying", motionClass: "site-icon-surveying" },
  welding: { label: "Welding in progress", motionClass: "site-icon-welding" },
  drilling: { label: "Breaking ground", motionClass: "site-icon-drilling" },
  steady: { label: "Cure / set time", motionClass: "site-icon-steady" },
  paused: { label: "Work paused", motionClass: "site-icon-paused" },
}
