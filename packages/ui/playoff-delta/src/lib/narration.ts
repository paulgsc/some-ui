/**
 * What is said over each scene of one Playoff Delta episode (FEED1, #2644):
 * the one part of the video an AI fills (FEED #2643, decision 3), as a black
 * box. The show owns the rest: this schema, the packet the filler reads, and
 * the check. The README's "What is said" says what each holds and refuses.
 */

import { sha256Hex } from "@some-ui/core-utils"
import {
  isOrdinal,
  problemsOf,
  Sha256Schema,
  tokenized,
  type Parsed,
} from "@some-ui/video-render"
import { z } from "zod"

import { factsOf, formatOf, kindOf, type FormatKind } from "./show"
import { LEGEND_SLIDES, LEGEND_WEEK, legendFacts } from "./slides"
import type { StorySeason } from "./story"
import { nameOf, seasonData, seasonTo } from "./story"
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
  /** The SHA-256 of the season up to this week (`seasonTo`). */
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
  /** Each team's code, as the facts write it, and its name, as it is said. */
  readonly names: Readonly<Record<string, string>>
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
    "A few sentences a scene, written to be heard: plain spoken English, with no lists, symbols or formatting.",
    "The facts write teams by code; say each by its name in names (LAR is the Rams), never by its code, which a voice can only spell or misread.",
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

async function pinsOf(season: StorySeason, week: number): Promise<Pins> {
  const format = formatOf(kindOf(week))
  return {
    schema: NARRATION_SCHEMA,
    season: season.label,
    team: season.team,
    week,
    format: { id: format.id, version: format.version },
    sha256: await sha256Hex(seasonData(seasonTo(season, week))),
  }
}

/** Everything a filler reads for one episode, or why there is no such episode. */
export async function packetOf(
  season: StorySeason,
  week: number
): Promise<Parsed<Packet>> {
  const scenes = scenesOf(season, week)
  if (!scenes.ok) return scenes
  return {
    ok: true,
    value: {
      schema: PACKET_SCHEMA,
      guidance: guidanceOf(season, kindOf(week)),
      pins: await pinsOf(season, week),
      scenes: scenes.value,
      names: season.names,
      words:
        week === LEGEND_WEEK
          ? []
          : LEGEND_SLIDES.flatMap((id) => legendFacts(season, id)),
      jsonSchema: z.toJSONSchema(NarrationSchema),
    },
  }
}

/** Words that join a list of numbers: "weeks 3 to 5", "seeds five or six". */
const JOINS: ReadonlySet<string> = new Set(["and", "to", "or", "through"])

const isNumber = (word: string): boolean => /^-?\d/.test(word)

const bare = (word: string): string =>
  word.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, "")

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The counts `text` says, read word by word as the take check reads them
 * (`tokenized`, so "one point five" and "7 and a half" are one number
 * each). Left out: team names ("49ers") and the season's label; a seed's
 * number ("#2 seed", "seeds five to seven"); a week's ("weeks eight and
 * fifteen", "the fifteenth week"), which go to `weeks`; any other ordinal
 * ("first, the division", "eleventh"); and a
 * lone "one", said as often for "one of them" or "one-way" as for a count.
 */
function numbersIn(
  text: string,
  season: StorySeason,
  weeks: Array<string> = []
): ReadonlyArray<string> {
  let rest = text
  const names = [...Object.values(season.names), season.label]
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length)
  for (const name of names) {
    rest = rest.replace(new RegExp(escape(name), "g"), " ")
  }
  const raw = rest.split(/\s+/).filter((w) => w !== "")
  const tokens = tokenized(raw)
  const counts: Array<string> = []
  let list: "week" | "seed" | null = null
  for (const [i, token] of tokens.entries()) {
    // A list runs to the end of its clause: "every week, two numbers".
    const ends = /[,.;:!?]$/.test(raw[token.last] ?? "")
    if (!isNumber(token.word)) {
      if (token.word === "week" || token.word === "seed") list = token.word
      else if (!JOINS.has(token.word)) list = null
      if (ends) list = null
      continue
    }
    const said = raw.slice(token.first, token.last + 1).map(bare)
    const last = said.at(-1) ?? ""
    // "twenty-first" is one raw word; its order is in its last piece.
    const ordinal = isOrdinal(last.split("-").at(-1) ?? "")
    const next = tokens[i + 1]?.word
    const seed = list === "seed" || next === "seed"
    const lone =
      token.word === "1" && said.length === 1 && /^one(?:-|$)/.test(last)
    if (list === "week" || (ordinal && next === "week")) weeks.push(token.word)
    else if (!seed && !ordinal && !lone) counts.push(token.word)
    if (ends) list = null
  }
  return counts
}

/**
 * The team codes `text` says ("LAR"), each once, in the order first said: a
 * voice spells a code or reads it as a word, so a fill names each team.
 * A code counts only as a whole word in capitals, so "no" or "Ne" isn't one.
 */
function codesIn(text: string, season: StorySeason): ReadonlyArray<string> {
  const codes = Object.keys(season.names).filter((c) => /^[A-Z]{2,3}$/.test(c))
  if (codes.length === 0) return []
  const found = text.match(
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${codes.join("|")})(?![\\p{L}\\p{N}])`,
      "gu"
    )
  )
  return [...new Set(found ?? [])]
}

/** How `fill`'s pins differ from the episode's. */
const pinProblems = (fill: Pins, want: Pins): ReadonlyArray<string> => [
  ...(["season", "team", "week", "sha256"] as const)
    .filter((k) => fill[k] !== want[k])
    .map(
      (k) => `${k} is ${String(fill[k])}, not this episode's ${String(want[k])}`
    ),
  // A fill is drawn in the version it was written for, any of the format's.
  ...(fill.format.id !== want.format.id ||
  fill.format.version > want.format.version
    ? [
        `the format is ${fill.format.id} v${fill.format.version}, not ${want.format.id} v${want.format.version} or an earlier version`,
      ]
    : []),
]

/** `data` as a fill of one episode's narration, or every reason it isn't. */
export async function checkNarration(
  season: StorySeason,
  week: number,
  data: unknown
): Promise<Parsed<Narration>> {
  const scenes = scenesOf(season, week)
  if (!scenes.ok) return scenes
  const parsed = NarrationSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, problems: problemsOf(parsed.error, "the fill") }
  }
  const fill = parsed.data
  const problems = [...pinProblems(fill, await pinsOf(season, week))]
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
    for (const code of codesIn(scene.said, season))
      problems.push(
        `${scene.id} says ${code}, a team's code: say ${nameOf(season, code)}`
      )
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

/** Where week `week`'s fill lives in a season's narration folder: week 0 is the legend. */
export const fillFile = (team: string, week: number): string =>
  `${team}-week-${String(week).padStart(2, "0")}.json`

/**
 * The weeks whose narration is due, given the file names in the season's
 * narration folder: the legend once, then every played week after the
 * newest one filled. A first run fills the legend and the newest week only,
 * never the weeks before it.
 */
export function dueWeeks(
  season: StorySeason,
  names: ReadonlyArray<string>
): ReadonlyArray<number> {
  const played = season.weeks.map((w) => w.week)
  const filled = played.filter((w) => names.includes(fillFile(season.team, w)))
  const weeks =
    filled.length === 0
      ? [Math.max(...played)]
      : played.filter((w) => w > Math.max(...filled))
  const legend = names.includes(fillFile(season.team, LEGEND_WEEK))
  return [...(legend ? [] : [LEGEND_WEEK]), ...weeks]
}

const NARRATION_INDEX_SCHEMA = "some-ui.pd-narration-index/1"

type IndexedFill = {
  readonly season: string
  readonly team: string
  readonly week: number
  /** Lowercase hex SHA-256 of the fill's file, byte for byte. */
  readonly sha256: string
}

/**
 * Every fill `paulgsc/testing` holds, in one file home can read
 * (`playoff-delta/index.json`, FEED4 #2647): home reads only
 * `raw.githubusercontent.com`, which can't list a folder. A fill's file is
 * `<season>/narration/<team>-week-NN.json` and its season's
 * `<season>/<team>.json`, both beside the index.
 */
export type NarrationIndex = {
  readonly schema: typeof NARRATION_INDEX_SCHEMA
  /** By season, team and week. */
  readonly fills: ReadonlyArray<IndexedFill>
}

/** A file in a season's narration folder, as read from the repository. */
export type FillOnDisk = {
  /** Its season folder's name: "2026". */
  readonly season: string
  /** Its name in the season's `narration/`: "SF-week-08.json". */
  readonly name: string
  readonly bytes: Uint8Array
}

const FILL_NAME = /^([A-Z]{2,3})-week-(\d{2})\.json$/
const SEASON_FOLDER = /^\d{4}$/

const FillPinsSchema = NarrationSchema.pick({
  schema: true,
  season: true,
  team: true,
  week: true,
}).loose()

/**
 * The index of `files`, or why it can't be made: a name that isn't a fill's,
 * or a fill whose pins name another episode than where it lies. It judges
 * only where a fill is; whether its words check is `checkNarration`'s, run
 * before the fill landed.
 */
export async function narrationIndex(
  files: ReadonlyArray<FillOnDisk>
): Promise<Parsed<NarrationIndex>> {
  const problems: Array<string> = []
  const fills: Array<IndexedFill> = []
  for (const file of files) {
    const where = `${file.season}/narration/${file.name}`
    const named = FILL_NAME.exec(file.name)
    if (!SEASON_FOLDER.test(file.season) || !named) {
      problems.push(
        `${where} isn't named as a fill: <season>/narration/<team>-week-NN.json`
      )
      continue
    }
    const [, team = "", week = ""] = named
    let json: unknown
    try {
      json = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(file.bytes)
      )
    } catch {
      problems.push(`${where} isn't JSON`)
      continue
    }
    const pins = FillPinsSchema.safeParse(json)
    if (!pins.success) {
      problems.push(`${where} isn't a fill (${NARRATION_SCHEMA})`)
      continue
    }
    const at = { season: file.season, team, week: Number(week) }
    if (
      pins.data.season !== at.season ||
      pins.data.team !== at.team ||
      pins.data.week !== at.week
    ) {
      problems.push(
        `${where} is the fill of ${pins.data.season} ${pins.data.team} week ${pins.data.week}`
      )
      continue
    }
    const bytes = new Uint8Array(file.bytes).buffer
    fills.push({ ...at, sha256: await sha256Hex(bytes) })
  }
  if (problems.length > 0) return { ok: false, problems }
  fills.sort(
    (a, b) =>
      a.season.localeCompare(b.season) ||
      a.team.localeCompare(b.team) ||
      a.week - b.week
  )
  return { ok: true, value: { schema: NARRATION_INDEX_SCHEMA, fills } }
}
