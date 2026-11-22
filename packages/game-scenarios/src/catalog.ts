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

/**
 * Which unit a bite is about (#3049): who has the ball decides offense or
 * defense, a kick special teams, a decision coaching first.
 */
export const UNITS = [
  "offense",
  "defense",
  "special-teams",
  "coaching",
] as const
export type Unit = (typeof UNITS)[number]

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

/**
 * What a claim measures (#3041, D26: the nine to start): each computed by
 * home from the plays it keeps, about one unit of a team.
 */
export const MEASURES = [
  "pass-rush",
  "third-down",
  "red-zone",
  "fourth-down-go",
  "two-minute",
  "challenges-won",
  "timeouts-at-half",
  "takeaways",
  "explosives-allowed",
] as const
export type Measure = (typeof MEASURES)[number]

/** What a claim says of its measure, and the two sides each shape has (#3041). */
export const CLAIM_SHAPES = ["rank", "vs-league", "vs-team", "trend"] as const
export type ClaimShape = (typeof CLAIM_SHAPES)[number]

export const CLAIM_SIDES = {
  rank: ["best", "worst"],
  "vs-league": ["better", "worse"],
  "vs-team": ["better", "worse"],
  trend: ["improving", "declining"],
} as const satisfies Readonly<Record<ClaimShape, readonly [string, string]>>
export type ClaimSide<S extends ClaimShape = ClaimShape> =
  (typeof CLAIM_SIDES)[S][number]

/** When a claim is settled (#3041). */
export const DEADLINES = ["after-games", "by-week", "season-end"] as const
export type Deadline = (typeof DEADLINES)[number]

/**
 * Where a claim stands, as home reads it each week (#3041); `withdrawn` for
 * one whose bite the owner deleted (the owner, 2026-11-18).
 */
export const VERDICTS = [
  "holding",
  "against-so-far",
  "too-early",
  "settled-right",
  "settled-wrong",
  "withdrawn",
] as const
export type Verdict = (typeof VERDICTS)[number]

/**
 * The claim algebra (#3041, D24–D26): each measure's unit and which way is
 * better (none for a style, such as how often a team goes for it), each
 * shape's sides, the deadlines and the verdicts.
 */
export type ClaimAlgebra = {
  readonly measures: ReadonlyArray<{
    readonly id: Measure
    readonly unit: Unit
    readonly better: "higher" | "lower" | null
  }>
  readonly shapes: ReadonlyArray<ClaimShape>
  readonly deadlines: ReadonlyArray<Deadline>
  readonly verdicts: ReadonlyArray<Verdict>
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
  readonly units: ReadonlyArray<Unit>
  readonly claims: ClaimAlgebra
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
  units: ReadonlyArray<string>
  claims: {
    measures: ReadonlyArray<{
      id: string
      unit: string
      better: string | null
    }>
    shapes: ReadonlyArray<{ id: string; sides: ReadonlyArray<string> }>
    deadlines: ReadonlyArray<string>
    verdicts: ReadonlyArray<string>
  }
}): Catalog {
  allOf(
    BIG_PLAY_SIZES,
    raw.big_play.sizes.map((size) => size.id),
    "big-play size"
  )
  allOf(
    BIG_PLAY_KINDS,
    raw.big_play.kinds.map((kind) => kind.id),
    "big-play kind"
  )
  allOf(
    MEASURES,
    raw.claims.measures.map((measure) => measure.id),
    "measure"
  )
  const shapes = allOf(
    CLAIM_SHAPES,
    raw.claims.shapes.map((shape) => shape.id),
    "claim shape"
  )
  for (const shape of raw.claims.shapes) {
    const id = oneOf(CLAIM_SHAPES, shape.id, "claim shape")
    allOf(CLAIM_SIDES[id], shape.sides, `sides of ${id}`)
  }
  return {
    version: raw.version,
    scenarios: raw.scenarios.map((s) => ({
      ...s,
      phase: oneOf(PHASES, s.phase, `phase in ${s.id}`),
      moment: oneOf(MOMENTS, s.moment, `moment in ${s.id}`),
    })),
    halves: allOf(HALVES, raw.halves, "half"),
    units: allOf(UNITS, raw.units, "unit"),
    bigPlay: {
      sizes: raw.big_play.sizes.map((size) => ({
        id: oneOf(BIG_PLAY_SIZES, size.id, "big-play size"),
        yards: size.yards,
      })),
      kinds: raw.big_play.kinds.map((kind) => ({
        id: oneOf(BIG_PLAY_KINDS, kind.id, "big-play kind"),
        least: oneOf(BIG_PLAY_SIZES, kind.least, `least size of ${kind.id}`),
      })),
    },
    claims: {
      measures: raw.claims.measures.map((measure) => ({
        id: oneOf(MEASURES, measure.id, "measure"),
        unit: oneOf(UNITS, measure.unit, `unit of ${measure.id}`),
        better:
          measure.better === null
            ? null
            : oneOf(
                ["higher", "lower"] as const,
                measure.better,
                `better of ${measure.id}`
              ),
      })),
      shapes,
      deadlines: allOf(DEADLINES, raw.claims.deadlines, "deadline"),
      verdicts: allOf(VERDICTS, raw.claims.verdicts, "verdict"),
    },
  }
}

export const CATALOG: Catalog = parseCatalog(snapshot)

/** The version every bite and every weekly bundle records. */
export const CATALOG_VERSION: number = CATALOG.version
