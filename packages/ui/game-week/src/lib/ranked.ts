/**
 * What a bite can be about at a moment, most plausible first (GWB18,
 * #3049): home's ranked list when it sends one, which names every scenario
 * once, in three tiers (what fits now, in the engine's own order; what is
 * always plausible; the rest), each with the unit a bite on it is about by
 * default. Away from home, or from a home before it ranks, every scenario
 * in the catalog's order, in the last tier, with no unit. Pure.
 */
import type { ScenarioId, Unit } from "@some-ui/game-scenarios"
import { SCENARIOS, UNITS } from "@some-ui/game-scenarios"

/** The ranked list's tiers, most plausible first. */
export const TIERS = ["now", "always", "rest"] as const
export type Tier = (typeof TIERS)[number]

/**
 * Which unit a bite is about, and whose: `side` is the team's code ("CHI"),
 * or null when it is about no one team.
 */
export type BiteUnit = {
  readonly unit: Unit
  readonly side: string | null
}

/** One scenario in the ranked list. */
export type RankedEntry = {
  readonly scenario: ScenarioId
  readonly tier: Tier
  /** The unit a bite on it is about by default; null when none fits. */
  readonly unit: BiteUnit | null
}

const CATALOG_ORDER: ReadonlyArray<RankedEntry> = SCENARIOS.map((each) => ({
  scenario: each.id,
  tier: "rest",
  unit: null,
}))

/**
 * Every scenario, most plausible first: `ranked` as home sent it (null
 * when it sent none), then any scenario it left out, in the catalog's
 * order, in the last tier, so every scenario stays pickable.
 */
export function rankedList(
  ranked: ReadonlyArray<RankedEntry> | null
): ReadonlyArray<RankedEntry> {
  if (ranked === null || ranked.length === 0) return CATALOG_ORDER
  // A scenario home names twice is kept where it first ranks it.
  const named = new Set<string>()
  const once = ranked.filter((entry) => {
    if (named.has(entry.scenario)) return false
    named.add(entry.scenario)
    return true
  })
  return [
    ...once,
    ...CATALOG_ORDER.filter((entry) => !named.has(entry.scenario)),
  ]
}

/** The unit a bite on `scenario` is about by default, from the list. */
export function unitOf(
  list: ReadonlyArray<RankedEntry>,
  scenario: ScenarioId
): BiteUnit | null {
  return list.find((entry) => entry.scenario === scenario)?.unit ?? null
}

/**
 * The unit one tap moves a bite to: the next of `UNITS`, then none, then
 * the first again, so a stray tap can always be taken back. Whose it is
 * stays; from none it is `side`, the team the list names for the scenario,
 * or no one team.
 */
export function nextUnit(
  unit: BiteUnit | null,
  side: string | null = null
): BiteUnit | null {
  if (unit === null) return { unit: UNITS[0], side }
  const at = UNITS.indexOf(unit.unit)
  const next = UNITS[at + 1]
  return next === undefined ? null : { unit: next, side: unit.side }
}
