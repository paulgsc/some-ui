/** The game-week scenario set: paulgsc/server's dump, copied (see the README). */
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
  "halftime",
  "onside-kick",
] as const
export type Moment = (typeof MOMENTS)[number]

/** The half an in-game bite was in (#3048, D10). */
export const HALVES = ["first", "second", "overtime"] as const
export type Half = (typeof HALVES)[number]

/** How big a big play was, smallest first (#3048, D8). */
export const BIG_PLAY_SIZES = ["big", "huge", "memorable"] as const
export type BigPlaySize = (typeof BIG_PLAY_SIZES)[number]

/** What a big play was, sided by the team that gained (#3048, D9). */
export const BIG_PLAY_KINDS = [
  "pass",
  "run",
  "kick-return",
  "punt-return",
  "interception-return",
  "fumble-return",
] as const
export type BigPlayKind = (typeof BIG_PLAY_KINDS)[number]

/**
 * The big-play algebra: the fewest yards each size starts at, and the
 * smallest size each kind counts from (a kick return only from `huge`).
 */
export type BigPlayAlgebra = {
  readonly sizes: ReadonlyArray<{
    readonly id: BigPlaySize
    readonly yards: number
  }>
  readonly kinds: ReadonlyArray<{
    readonly id: BigPlayKind
    readonly least: BigPlaySize
  }>
}

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
  readonly halves: ReadonlyArray<Half>
  readonly bigPlay: BigPlayAlgebra
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

/**
 * Each of `values`, narrowed to `allowed`, which they must name in full and
 * in its order: a value this code does not know, or one of its values the
 * dump lacks, fails.
 */
function allOf<T extends string>(
  allowed: ReadonlyArray<T>,
  values: ReadonlyArray<string>,
  what: string
): ReadonlyArray<T> {
  const read = values.map((value) => oneOf(allowed, value, what))
  if (read.join() !== allowed.join())
    throw new Error(
      `${what}: ${values.join(", ")} is not ${allowed.join(", ")}`
    )
  return read
}

/** Narrows the dump's JSON, failing on a phase, moment or dimension this code does not know. */
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
  halves: ReadonlyArray<string>
  big_play: {
    sizes: ReadonlyArray<{ id: string; yards: number }>
    kinds: ReadonlyArray<{ id: string; least: string }>
  }
}): Catalog {
  const sizes = allOf(
    BIG_PLAY_SIZES,
    raw.big_play.sizes.map((size) => size.id),
    "big-play size"
  )
  const kinds = allOf(
    BIG_PLAY_KINDS,
    raw.big_play.kinds.map((kind) => kind.id),
    "big-play kind"
  )
  return {
    version: raw.version,
    scenarios: raw.scenarios.map((s) => ({
      ...s,
      phase: oneOf(PHASES, s.phase, `phase in ${s.id}`),
      moment: oneOf(MOMENTS, s.moment, `moment in ${s.id}`),
    })),
    halves: allOf(HALVES, raw.halves, "half"),
    bigPlay: {
      sizes: raw.big_play.sizes.map((size, i) => ({
        id: sizes[i]!,
        yards: size.yards,
      })),
      kinds: raw.big_play.kinds.map((kind, i) => ({
        id: kinds[i]!,
        least: oneOf(BIG_PLAY_SIZES, kind.least, `least size of ${kind.id}`),
      })),
    },
  }
}

export const CATALOG: Catalog = parseCatalog(snapshot)

/** The version every bite and every weekly bundle records. */
export const CATALOG_VERSION: number = CATALOG.version
