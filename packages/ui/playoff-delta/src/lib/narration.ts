/**
 * What is said over each scene of one Playoff Delta episode (FEED1, #2644):
 * the one part of the video an AI fills (FEED #2643, decision 3), as a black
 * box. The show owns the rest: this schema, the packet the filler reads, and
 * the check. The README's "What is said" says what each holds and refuses.
 */

import {
  factTerms,
  problemsOf,
  Sha256Schema,
  type Parsed,
} from "@some-ui/video-render"
import { z } from "zod"

import { factsOf, formatOf, kindOf, type FormatKind } from "./show"
import { LEGEND_SLIDES, LEGEND_WEEK, legendFacts } from "./slides"
import type { StorySeason } from "./story"
import { nameOf } from "./story"
import { FORECAST, FORECAST_WORDS } from "./words"

export const NARRATION_SCHEMA = "some-ui.pd-narration/1"
const PACKET_SCHEMA = "some-ui.pd-packet/1"

/** The longest a scene's words may be: about thirty seconds said. */
export const SAID_MAX = 600

const NarrationSchema = z.strictObject({
  schema: z.literal(NARRATION_SCHEMA),
  /** The season's label, as the stage shows it: "2025". */
  season: z.string().min(1),
  /** Whose side the season is read from. */
  team: z.string().min(1),
  /** The week (0 for the legend). */
  week: z.number().int().nonnegative(),
  format: z.strictObject({
    id: z.string().min(1),
    version: z.number().int().positive(),
  }),
  /** The season's sum (`seasonData`), the same the episode pins. */
  sha256: Sha256Schema,
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

/** Which episode a fill is of: the fields it copies as they are. */
type Pins = Omit<Narration, "scenes">

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
  /** What the legend taught, which every week's words mean; none in the legend itself. */
  readonly words: ReadonlyArray<string>
  readonly jsonSchema: unknown
}

/** Who the words are for and what they are for, never how to find them. */
function guidanceOf(season: StorySeason, kind: FormatKind): Array<string> {
  const team = nameOf(season, season.team)
  return [
    kind === "week"
      ? `Write what a voice says over each scene of one week of Playoff Delta, a short I watch about my team, the ${team}. I've seen the legend, so I know the words below.`
      : `Write what a voice says over each scene of Playoff Delta's legend, the short that teaches me, a fan of the ${team}, the words every week uses.`,
    "Each scene's facts are true, and they are what the screen shows while it is said. Make the scene's point from them, and say why where that helps me see how the week moved our paths to the playoffs.",
    "A few sentences a scene, written to be heard: plain spoken English, with no lists, symbols or formatting. Name teams as the facts name them.",
    "Every number said is one its scene's facts give.",
    `Say what can still happen, never a forecast: none of the words ${FORECAST_WORDS.join(", ")}.`,
    "Return one JSON object in the shape of jsonSchema: copy pins as they are, then one entry in scenes per scene below, in the same order, with its id and what is said.",
  ]
}

/** The scenes of one episode, with their facts, or why there aren't any. */
function scenesOf(
  season: StorySeason,
  week: number
): Parsed<ReadonlyArray<PacketScene>> {
  const facts = factsOf(season, week)
  if (!facts.ok) return facts
  return {
    ok: true,
    value: formatOf(kindOf(week)).scenes.map((scene, i) => ({
      id: scene.id,
      name: scene.name,
      point: scene.point,
      facts: facts.value[i] ?? [],
    })),
  }
}

function pinsOf(season: StorySeason, week: number, sha256: string): Pins {
  const format = formatOf(kindOf(week))
  return {
    schema: NARRATION_SCHEMA,
    season: season.label,
    team: season.team,
    week,
    format: { id: format.id, version: format.version },
    sha256,
  }
}

/** Everything a filler reads for one episode, or why there is no such episode. */
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
      words:
        week === LEGEND_WEEK
          ? []
          : LEGEND_SLIDES.flatMap((id) => legendFacts(season, id)),
      jsonSchema: z.toJSONSchema(NarrationSchema),
    },
  }
}

const TENS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety"

const ORDINAL =
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\b/gi

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The numbers `text` says, as the take check reads them (`factTerms`), once
 * what isn't a count is taken out: team names ("49ers"), the season's
 * label, a seed ("#1 seed", "seeds 5 to 7"), a week ("weeks 3 to 5"), whose
 * numbers go to `weeks`, an ordinal ("first, the division"), and "one" on
 * its own, said as often for "one of them" as for a count.
 */
function numbersIn(
  text: string,
  season: StorySeason,
  weeks: Array<string> = []
): ReadonlyArray<string> {
  const names = [...Object.values(season.names), season.label]
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length)
  let rest = text
  for (const name of names) {
    rest = rest.replace(new RegExp(escape(name), "g"), " ")
  }
  rest = rest
    .replace(/#\s?\d+ seed/gi, " ")
    .replace(/\bseeds? \S+(?: to \S+)?/gi, " ")
    .replace(/\bweeks? (\S+(?: to \S+)?)/gi, (_, n: string) => {
      weeks.push(...factTerms(n.replace(/\bone\b/gi, "1")).numbers)
      return " "
    })
    .replace(new RegExp(`(?<!\\b(?:${TENS})[\\s-])\\bone\\b`, "gi"), " ")
    .replace(ORDINAL, " ")
  return factTerms(rest).numbers
}

/** How `fill`'s pins differ from the episode's. */
const pinProblems = (fill: Pins, want: Pins): ReadonlyArray<string> => [
  ...(["season", "team", "week", "sha256"] as const)
    .filter((k) => fill[k] !== want[k])
    .map(
      (k) => `${k} is ${String(fill[k])}, not this episode's ${String(want[k])}`
    ),
  ...(fill.format.id !== want.format.id ||
  fill.format.version !== want.format.version
    ? [
        `the format is ${fill.format.id} v${fill.format.version}, not ${want.format.id} v${want.format.version}`,
      ]
    : []),
]

/** `data` as a fill of one episode's narration, or every reason it isn't. */
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
    return { ok: false, problems: problemsOf(parsed.error, "the fill") }
  }
  const fill = parsed.data
  const problems = [...pinProblems(fill, pinsOf(season, week, sha256))]
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
    if (forecast) problems.push(`${scene.id} forecasts: "${forecast[0]}"`)
    const given = new Set(
      [facts.point, ...facts.facts].flatMap((f) => numbersIn(f, season))
    )
    const weeks: Array<string> = []
    for (const n of new Set(numbersIn(scene.said, season, weeks))) {
      if (!given.has(n)) {
        problems.push(`${scene.id} says ${n}, which its facts don't give`)
      }
    }
    for (const w of new Set(weeks)) {
      const n = Number(w)
      if (week === LEGEND_WEEK) {
        problems.push(`${scene.id} says week ${w}, and the legend names none`)
      } else if (!Number.isInteger(n) || n < 1 || n > week) {
        problems.push(`${scene.id} says week ${w}, which isn't played yet`)
      }
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: fill }
}
