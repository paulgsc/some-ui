/**
 * The game-week scenario set, read from paulgsc/server's dump
 * (`crates/game_scenarios`, `dump-game-scenarios`). The server is the source
 * of truth: the scenario engine compiles against it, and its
 * `scripts/check_client_fixtures.py` fails when `game-scenarios.snapshot.json`
 * and a fresh dump differ. Never edit the copy by hand; regenerate it:
 *
 *   cargo run -q --bin dump-game-scenarios > packages/game-scenarios/src/game-scenarios.snapshot.json
 *
 * Every game is read through one team, "us": an outcome "for us" is the one
 * that team wants.
 */
import snapshot from "./game-scenarios.snapshot.json"

export const PHASES = ["pre", "in", "post", "you"] as const
export type Phase = (typeof PHASES)[number]

/** The kind of moment the server's scenario engine keys each scenario on. */
export const MOMENTS = [
  "pregame",
  "kickoff",
  "opening-drive",
  "lead-change",
  "third-and-long",
  "fourth-down",
  "try",
  "snap",
  "red-zone",
  "two-minute",
  "turnover",
  "penalty",
  "sack",
  "big-play",
  "kick",
  "injury",
  "final",
  "watching",
] as const
export type Moment = (typeof MOMENTS)[number]

export type CatalogEntry = {
  /** Dotted, `<phase>.<name>`, e.g. `in.third-long`. */
  readonly id: string
  readonly phase: Phase
  readonly name: string
  readonly covers: string
  /** What home can fill in about how it came out, as slugs from our side. */
  readonly outcomes: ReadonlyArray<string>
  readonly moment: Moment
}

export type Catalog = {
  readonly version: number
  readonly scenarios: ReadonlyArray<CatalogEntry>
}

function oneOf<T extends string>(
  allowed: ReadonlyArray<T>,
  value: string,
  what: string
): T {
  const found = allowed.find((a) => a === value)
  if (found === undefined) throw new Error(`unknown ${what}: ${value}`)
  return found
}

/** Narrows the dump's JSON, failing on a phase or moment this code does not know. */
export function parseCatalog(raw: {
  version: number
  scenarios: ReadonlyArray<{
    id: string
    phase: string
    name: string
    covers: string
    outcomes: ReadonlyArray<string>
    moment: string
  }>
}): Catalog {
  return {
    version: raw.version,
    scenarios: raw.scenarios.map((s) => ({
      ...s,
      phase: oneOf(PHASES, s.phase, `phase in ${s.id}`),
      moment: oneOf(MOMENTS, s.moment, `moment in ${s.id}`),
    })),
  }
}

export const CATALOG: Catalog = parseCatalog(snapshot)

/** The version every bite and every weekly bundle records. */
export const CATALOG_VERSION: number = CATALOG.version
