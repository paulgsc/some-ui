/**
 * What is said over each scene of one Playoff Delta episode (FEED1, #2644):
 * the one part of the video an AI fills (FEED #2643, decision 3). The show
 * owns everything else: the format, the scenes' points and facts, this
 * schema, and the check. The fill is a black box: nothing here tells it how
 * to word a scene, only what it is for and what shape comes back.
 *
 * - **The packet** (`packetOf`) is everything a filler reads, and nothing
 *   else: the guidance, the pins to copy, each scene's point and facts, the
 *   words the legend taught, and the schema as JSON Schema. It holds only
 *   what the episode already shows publicly, since the filler is a third
 *   party (`docs/learner-data-authority.md`).
 * - **The check** (`checkNarration`) refuses a fill whose shape or pins
 *   aren't this episode's, that forecasts, or that says a number its
 *   scene's facts don't hold. It judges nothing about the words beyond that.
 */

import type { Parsed } from "@some-ui/video-render"
import { z } from "zod"

import { FORMAT_VERSION, formatOf, type FormatKind } from "./show"
import {
  LEGEND_SLIDES,
  LEGEND_WEEK,
  legendFacts,
  SCENES,
  WEEK_SLIDES,
  weekFacts,
} from "./slides"
import type { StorySeason } from "./story"
import { nameOf } from "./story"
import { FORECAST } from "./words"

export const NARRATION_SCHEMA = "some-ui.pd-narration/1"
const PACKET_SCHEMA = "some-ui.pd-packet/1"

/** The longest a scene's words may be: about thirty seconds said. */
export const SAID_MAX = 600

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const NarrationSchema = z.strictObject({
  schema: z.literal(NARRATION_SCHEMA),
  /** The season's label, as the stage shows it: "2025". */
  season: z.string().min(1),
  /** Whose side the season is read from. */
  team: z.string().min(1),
  /** The week (0 for the legend). */
  week: z.number().int().nonnegative(),
  /** The format the scenes are the episode's of. */
  format: z.strictObject({
    id: z.string().min(1),
    version: z.number().int().positive(),
  }),
  /** The season's sum as the stage read it, the same the episode pins. */
  sha256: Sha256,
  /** One per scene of the format, in its order. */
  scenes: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        said: z.string().trim().min(1).max(SAID_MAX),
      })
    )
    .min(1),
})

export type Narration = z.infer<typeof NarrationSchema>

/** The fields a fill copies as they are: which episode it is of. */
type Pins = Pick<
  Narration,
  "schema" | "season" | "team" | "week" | "format" | "sha256"
>

type PacketScene = {
  readonly id: string
  readonly name: string
  readonly point: string
  readonly facts: ReadonlyArray<string>
}

export type Packet = {
  readonly schema: typeof PACKET_SCHEMA
  readonly guidance: ReadonlyArray<string>
  readonly pins: Pins
  readonly scenes: ReadonlyArray<PacketScene>
  /** What the legend taught, which every week's words mean. */
  readonly words: ReadonlyArray<string>
  /** The shape the fill comes back in. */
  readonly jsonSchema: unknown
}

const kindOf = (week: number): FormatKind =>
  week === LEGEND_WEEK ? "legend" : "week"

/**
 * What a filler is asked, in the order it reads. It says who the words are
 * for and what they are for, never how to find them.
 */
function guidanceOf(season: StorySeason, kind: FormatKind): Array<string> {
  const team = nameOf(season, season.team)
  return [
    kind === "week"
      ? `Write what a voice says over each scene of one week of Playoff Delta, a short I watch about my team, the ${team}. I've seen the legend, so I know the words below.`
      : `Write what a voice says over each scene of Playoff Delta's legend, the short that teaches me, a fan of the ${team}, the words every week uses.`,
    "Each scene's facts are true, and they are what the screen shows while it is said. Make the scene's point from them, and say why where that helps me see how the week moved our paths to the playoffs.",
    "A few sentences a scene, written to be heard: plain spoken English, with no lists, symbols or formatting. Name teams as the facts name them.",
    "Every number said is one its scene's facts give.",
    "Say what can still happen, never a forecast: no chance, odds, likely, probability, percent, share, spread, average or sample.",
    "Return one JSON object in the shape of jsonSchema: copy pins as they are, then one entry in scenes per scene below, in the same order, with its id and what is said.",
  ]
}

/** The scenes of one episode, with their facts, or why there aren't any. */
function scenesOf(
  season: StorySeason,
  week: number
): Parsed<ReadonlyArray<PacketScene>> {
  if (week === LEGEND_WEEK) {
    return {
      ok: true,
      value: LEGEND_SLIDES.map((id) => ({
        id,
        name: SCENES[id].name,
        point: SCENES[id].point,
        facts: legendFacts(season, id),
      })),
    }
  }
  const shown = season.weeks.find((w) => w.week === week)
  if (!shown) return { ok: false, problems: [`the season has no week ${week}`] }
  return {
    ok: true,
    value: WEEK_SLIDES.map((id) => ({
      id,
      name: SCENES[id].name,
      point: SCENES[id].point,
      facts: weekFacts(season, shown, id),
    })),
  }
}

const pinsOf = (season: StorySeason, week: number, sha256: string): Pins => {
  const kind = kindOf(week)
  return {
    schema: NARRATION_SCHEMA,
    season: season.label,
    team: season.team,
    week,
    format: { id: formatOf(kind).id, version: FORMAT_VERSION[kind] },
    sha256,
  }
}

/**
 * Everything a filler reads for one episode (week 0 for the legend), or why
 * there is no such episode. `sha256` is the season's sum as the stage reads
 * it (`seasonData`).
 */
export function packetOf(
  season: StorySeason,
  week: number,
  sha256: string
): Parsed<Packet> {
  const scenes = scenesOf(season, week)
  if (!scenes.ok) return scenes
  return {
    ok: true,
    value: {
      schema: PACKET_SCHEMA,
      guidance: guidanceOf(season, kindOf(week)),
      pins: pinsOf(season, week, sha256),
      scenes: scenes.value,
      words: LEGEND_SLIDES.flatMap((id) => legendFacts(season, id)),
      jsonSchema: z.toJSONSchema(NarrationSchema),
    },
  }
}

/**
 * The season as the stage reads it, the bytes the episode's sum is of: the
 * recorder sums the JSON the stage publishes, which is this.
 */
export const seasonData = (season: StorySeason): string =>
  JSON.stringify(season)

const WORD_VALUES: Readonly<Record<string, number>> = {
  zero: 0,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

// "one" is left out: it is said as often for "one of them" as for a count.
const NUMBER = new RegExp(
  `(\\d+(?:\\.5)?½?|½|\\b(?:${Object.keys(WORD_VALUES).join("|")})(?: and a half)?\\b)`,
  "gi"
)

/** A week said by its number: "week 9", "week nine", "week one". */
const WEEK_SAID = new RegExp(
  `\\bweeks? (\\d+|one|${Object.keys(WORD_VALUES).join("|")})\\b`,
  "gi"
)

/** A number as said: "6", "6½", "½", "six", "six and a half". */
function valueOf(token: string): number {
  const lower = token.toLowerCase()
  const half = lower.endsWith("½") || lower.endsWith(" and a half") ? 0.5 : 0
  const whole = lower.replace(/½$/, "").replace(/ and a half$/, "")
  if (whole === "") return half
  const value = WORD_VALUES[whole] ?? Number(whole)
  return value + half
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The numbers `text` says, with what isn't a count taken out first: team
 * names ("49ers"), the season's label, a seed ("#1 seed", "seeds 5 to 7")
 * and a week ("week 9"), whose number `weeks` collects.
 */
function numbersIn(
  text: string,
  season: StorySeason,
  weeks: Array<number> = []
): ReadonlyArray<number> {
  const names = [...Object.values(season.names), season.label]
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length)
  let rest = text
  for (const name of names) {
    rest = rest.replace(new RegExp(escape(name), "g"), " ")
  }
  rest = rest
    .replace(/#\s?1 seed/gi, " ")
    .replace(/\bseeds? \d+(?: to \d+)?/gi, " ")
    .replace(WEEK_SAID, (_, n: string) => {
      weeks.push(n.toLowerCase() === "one" ? 1 : valueOf(n))
      return " "
    })
  return [...rest.matchAll(NUMBER)].map((m) => valueOf(m[0]))
}

const samePins = (a: Pins, b: Pins): ReadonlyArray<string> =>
  (["schema", "season", "team", "week", "sha256"] as const)
    .filter((k) => a[k] !== b[k])
    .map((k) => `${k} is ${String(a[k])}, not this episode's ${String(b[k])}`)
    .concat(
      a.format.id !== b.format.id || a.format.version !== b.format.version
        ? [
            `the format is ${a.format.id} v${a.format.version}, not ${b.format.id} v${b.format.version}`,
          ]
        : []
    )

/**
 * `data` as a fill of one episode's narration, or every reason it isn't:
 * not in the schema's shape, another episode's pins, scenes other than the
 * format's in its order, a forecast, or a number its scene's facts don't
 * give (a week said must be one the season has played by now).
 */
export function checkNarration(
  season: StorySeason,
  week: number,
  sha256: string,
  data: unknown
): Parsed<Narration> {
  const scenes = scenesOf(season, week)
  if (!scenes.ok) return scenes
  const parsed = NarrationSchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "the fill"}: ${i.message}`
      ),
    }
  }
  const fill = parsed.data
  const problems: Array<string> = [
    ...samePins(fill, pinsOf(season, week, sha256)),
  ]
  const want = scenes.value.map((s) => s.id)
  const got = fill.scenes.map((s) => s.id)
  if (want.join() !== got.join()) {
    problems.push(
      `the scenes are ${got.join(", ")}, not the format's ${want.join(", ")}`
    )
  }
  for (const [i, scene] of fill.scenes.entries()) {
    const facts = scenes.value[i]
    if (facts?.id !== scene.id) continue
    const forecast = FORECAST.exec(scene.said)
    if (forecast) {
      problems.push(`${scene.id} forecasts: "${forecast[0]}"`)
    }
    const given = new Set(
      [facts.point, ...facts.facts].flatMap((f) => numbersIn(f, season))
    )
    const weeks: Array<number> = []
    const said = numbersIn(scene.said, season, weeks)
    for (const n of new Set(said)) {
      if (!given.has(n)) {
        problems.push(`${scene.id} says ${n}, which its facts don't give`)
      }
    }
    for (const w of new Set(weeks)) {
      if (w < 1 || w > week) {
        problems.push(`${scene.id} says week ${w}, which isn't played yet`)
      }
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: fill }
}
