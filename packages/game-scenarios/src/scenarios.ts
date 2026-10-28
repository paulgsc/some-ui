/** The catalog joined with how some-ui draws it: one value per scenario. */
import { CATALOG, type CatalogEntry } from "@game-scenarios/catalog"
import { ICONS } from "@game-scenarios/icons"
import { OUTCOME_WORDS, type ScenarioId } from "@game-scenarios/words"

export type Outcome = { readonly slug: string; readonly label: string }

export type Scenario = Omit<CatalogEntry, "id" | "outcomes"> & {
  readonly id: ScenarioId
  readonly outcomes: ReadonlyArray<Outcome>
  /** 24x24 stroke paths (`icons.ts`). */
  readonly icon: ReadonlyArray<string>
}

export function isScenarioId(id: string): id is ScenarioId {
  return Object.hasOwn(OUTCOME_WORDS, id)
}

function join(entry: CatalogEntry): Scenario {
  const { id } = entry
  if (!isScenarioId(id)) throw new Error(`no words or icon for scenario ${id}`)
  const words: Readonly<Record<string, string>> = OUTCOME_WORDS[id]
  return {
    ...entry,
    id,
    icon: ICONS[id],
    outcomes: entry.outcomes.map((slug) => {
      const label = words[slug]
      if (label === undefined)
        throw new Error(`no words for ${id} outcome ${slug}`)
      return { slug, label }
    }),
  }
}

/** Every scenario, in the catalog's order. */
export const SCENARIOS: ReadonlyArray<Scenario> = CATALOG.scenarios.map(join)

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
