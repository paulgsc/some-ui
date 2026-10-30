/**
 * Game Week Bites' one-off cards (GWB12, #2086): the `game-card` kind, one
 * card over a short's picture, which the shot writer picks and fills (GWB9)
 * and home's renderer draws (GWB10). No picture of it is made anywhere else.
 * Its params are a union on `template`, a fixed, versioned set:
 *
 * - `stat`: the situation, for one team: "3rd and 8", then "Down 4 · 1:52 left";
 * - `score`: the score at that moment, the visitors over the home team;
 * - `scenario`: a scenario's icon and name, from `@some-ui/game-scenarios`,
 *   and how it came out when that is known;
 * - `chain`: two to four outcomes, each leading to the next;
 * - `path`: Playoff Delta's paths for a week: how many more wins get the
 *   team in, and the best seed each can reach.
 *
 * Design `gridiron-v1` draws each as one panel at the top of the `body`
 * region, as tall as its words, so the picture shows below it, a headline
 * keeps the header and the subtitles keep the lower third. Teams are their
 * codes, as text, never a logo (#2074, constraint 4). A scenario's name,
 * phase and outcome words, and its icon, come from the catalog, never from
 * the params. The words are the same at every moment of a scene, so the
 * frame is too. Text that does not fit is refused with the reason, never cut.
 */

import {
  isScenarioId,
  PHASE_TITLES,
  SCENARIOS,
  type Scenario,
  type ScenarioId,
} from "@some-ui/game-scenarios"
import { assertNever } from "@some-ui/intent-kit"
import { z } from "zod"

import { REGIONS, type Box } from "./geometry"
import { blocksOf, type Panel } from "./journal"
import type { Parsed } from "./parsed"
import {
  barlow,
  bottomOf,
  setText,
  widthOf,
  type TextBlock,
  type TextStyle,
} from "./text"
import { ordinal, WORDS } from "./words"

export const GAME_CARD_DESIGNS = ["gridiron-v1"] as const

export const GAME_CARD_TEMPLATES = [
  "stat",
  "score",
  "scenario",
  "chain",
  "path",
] as const
export type GameCardTemplate = (typeof GAME_CARD_TEMPLATES)[number]

/** `gridiron-v1`'s palette. Video colours, not the app's, so literals. */
const INK = {
  panel: "#0b1526",
  edge: "#22324a",
  text: "#ffffff",
  muted: "#b8c4d6",
  /** The subtitles' gridiron yellow. */
  accent: "#ffd60a",
} as const

/** A team's code, as text: "SF", "SEA". */
const Team = z
  .string()
  .regex(/^[A-Z]{2,3}$/, "a team is its 2 or 3 letter code")

const QuarterSchema = z.union([z.number().int().min(1).max(4), z.literal("OT")])
export type Quarter = z.infer<typeof QuarterSchema>

/** The game clock: "1:52", up to "15:00". */
const Clock = z
  .string()
  .regex(/^(?:(?:1[0-4]|\d):[0-5]\d|15:00)$/, "the clock reads like 1:52")

const ScenarioIdSchema = z.custom<ScenarioId>(
  (v) => typeof v === "string" && isScenarioId(v),
  "no such scenario"
)

const StatSchema = z.object({
  template: z.literal("stat"),
  /** The team the situation is read for. */
  team: Team,
  down: z.number().int().min(1).max(4),
  toGo: z.union([z.number().int().min(1).max(99), z.literal("goal")]),
  /** The team's points minus the other's. */
  margin: z.number().int().min(-99).max(99),
  quarter: QuarterSchema,
  left: Clock,
})

const Side = z.object({ team: Team, points: z.number().int().min(0).max(99) })

const ScoreSchema = z.object({
  template: z.literal("score"),
  away: Side,
  home: Side,
  when: z.union([
    z.object({ quarter: QuarterSchema, left: Clock }),
    z.literal("halftime"),
    z.literal("final"),
  ]),
})

const ScenarioCardSchema = z.object({
  template: z.literal("scenario"),
  scenario: ScenarioIdSchema,
  /** How it came out: one of the scenario's outcomes, when known. */
  outcome: z.string().optional(),
})

const ChainStepSchema = z.union([
  /** A scenario and how it came out. */
  z.object({ scenario: ScenarioIdSchema, outcome: z.string() }),
  /** A few plain words, for what no scenario covers. */
  z.object({ text: z.string().min(1) }),
])

const ChainSchema = z.object({
  template: z.literal("chain"),
  kicker: z.string().default(""),
  steps: z.array(ChainStepSchema).min(2).max(4),
})

const PathSchema = z.object({
  template: z.literal("path"),
  team: Team,
  week: z.number().int().min(1).max(23),
  /**
   * The week's paths after its games, as Playoff Delta's story has them
   * (`paths.after`): `paths[x]` is the best seed the team can get in as
   * winning exactly x more games, null for none.
   */
  paths: z.array(z.number().int().min(1).max(7).nullable()).min(1).max(18),
})

export const GameCardParamsSchema = z.discriminatedUnion("template", [
  StatSchema,
  ScoreSchema,
  ScenarioCardSchema,
  ChainSchema,
  PathSchema,
])
export type GameCardParams = z.infer<typeof GameCardParamsSchema>

/** A scenario's icon, or an arrow or a mark, drawn as stroked paths. */
type Glyph = {
  readonly box: Box
  /** Paths in a 24x24 box, stroked 1.75 wide with round caps and joins. */
  readonly paths: ReadonlyArray<string>
  readonly colour: string
}

/** What a game card shows: the same at every moment of its scene. */
export type GameCardFrame = {
  readonly panels: ReadonlyArray<Panel>
  readonly blocks: ReadonlyArray<TextBlock>
  readonly glyphs: ReadonlyArray<Glyph>
}

const ARROW_DOWN = ["M12 3v17", "M6 14l6 6 6-6"] as const
const RING = ["M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0"] as const

/** The panel: the top of the body region, as wide as it. */
const PANEL_TOP = REGIONS.body.y + 40
const PANEL_FOOT = REGIONS.body.y + REGIONS.body.height
const STRIPE = 12
const PAD = 48
const X = REGIONS.body.x + STRIPE + PAD
const WIDTH = REGIONS.body.width - STRIPE - 2 * PAD
const TOP = PANEL_TOP + 44

type Named = Array<readonly [string, TextBlock | null]>
type At = { readonly x: number; readonly y: number; readonly width: number }

const at = (y: number, x = X, width = WIDTH): At => ({ x, y, width })

const KICKER: TextStyle = { ...barlow(800, 34, INK.accent), uppercase: true }

/** Where the next block goes: under `block`, or as far as it would reach. */
const under = (
  block: TextBlock | null,
  from: number,
  style: TextStyle,
  gap: number
): number =>
  (block ? bottomOf(block) : from + style.sizePx * style.lineHeight) + gap

/** `text` on one row, its right edge at `right`. */
function setRight(
  text: string,
  style: TextStyle,
  y: number,
  right: number
): TextBlock | null {
  const width = Math.ceil(widthOf(text, style))
  return setText(text, style, { x: right - width, y, width }, 1)
}

const square = (x: number, y: number, size: number): Box => ({
  x,
  y,
  width: size,
  height: size,
})

/** A block moved down by `dy`. */
const lowered = (b: TextBlock | null, dy: number): TextBlock | null =>
  b && { ...b, box: { ...b.box, y: b.box.y + dy } }

/** Every block's words set, and the panel drawn round them and the glyphs. */
function carded(
  name: string,
  named: Named,
  glyphs: ReadonlyArray<Glyph>
): Parsed<GameCardFrame> {
  const set = blocksOf(named)
  if (!set.ok) return set
  const foot =
    Math.max(
      ...set.value.blocks.map(bottomOf),
      ...glyphs.map((g) => g.box.y + g.box.height)
    ) + PAD
  if (foot > PANEL_FOOT)
    return { ok: false, problems: [`the ${name} doesn't fit`] }
  const height = foot - PANEL_TOP
  const box: Box = { ...REGIONS.body, y: PANEL_TOP, height }
  return {
    ok: true,
    value: {
      panels: [
        { box, fill: INK.panel, edge: INK.edge, edgePx: 2, radiusPx: 24 },
        {
          box: { x: box.x, y: box.y + 24, width: STRIPE, height: height - 48 },
          fill: INK.accent,
          edge: INK.accent,
          edgePx: 0,
          radiusPx: STRIPE / 2,
        },
      ],
      blocks: set.value.blocks,
      glyphs,
    },
  }
}

const words = WORDS.gameCard

function statCard(p: z.infer<typeof StatSchema>): Parsed<GameCardFrame> {
  const kicker = setText(
    `${p.team} · ${words.quarter(p.quarter)}`,
    KICKER,
    at(TOP),
    1
  )
  const bigStyle = barlow(800, 112, INK.text, 1.05)
  const bigY = under(kicker, TOP, KICKER, 12)
  const big = setText(
    words.downAndDistance(p.down, p.toGo),
    bigStyle,
    at(bigY),
    1
  )
  const lineStyle = barlow(600, 52, INK.muted)
  const line = setText(
    `${words.margin(p.margin)} · ${words.left(p.left)}`,
    lineStyle,
    at(under(big, bigY, bigStyle, 4)),
    1
  )
  return carded(
    "situation",
    [
      ["situation's kicker", kicker],
      ["down and distance", big],
      ["margin and clock", line],
    ],
    []
  )
}

function scoreCard(p: z.infer<typeof ScoreSchema>): Parsed<GameCardFrame> {
  const when =
    p.when === "halftime"
      ? words.halftime
      : p.when === "final"
        ? words.final
        : `${words.quarter(p.when.quarter)} · ${words.left(p.when.left)}`
  const kicker = setText(when, KICKER, at(TOP), 1)
  const style = barlow(800, 104, INK.text, 1.1)
  const lead = Math.sign(p.away.points - p.home.points)
  const named: Named = [["score's kicker", kicker]]
  const rows = [
    ["visitors'", p.away, lead > 0],
    ["home team's", p.home, lead < 0],
  ] as const
  let y = under(kicker, TOP, KICKER, 12)
  for (const [whose, side, leads] of rows) {
    named.push(
      [`${whose} code`, setText(side.team, style, at(y), 1)],
      [
        `${whose} points`,
        setRight(
          String(side.points),
          { ...style, colour: leads ? INK.accent : INK.text },
          y,
          X + WIDTH
        ),
      ]
    )
    y += style.sizePx * style.lineHeight
  }
  return carded("score", named, [])
}

const BY_ID = new Map<string, Scenario>(SCENARIOS.map((s) => [s.id, s]))

/** The scenario as the catalog has it, and its outcome's words when asked. */
function lookUp(
  id: ScenarioId,
  outcome: string | undefined
): Parsed<{ readonly scenario: Scenario; readonly outcome: string | null }> {
  const scenario = BY_ID.get(id)
  if (!scenario) return { ok: false, problems: [`no such scenario: ${id}`] }
  if (outcome === undefined)
    return { ok: true, value: { scenario, outcome: null } }
  const label = scenario.outcomes.find((o) => o.slug === outcome)?.label
  return label === undefined
    ? {
        ok: false,
        problems: [`${scenario.name} has no outcome "${outcome}"`],
      }
    : { ok: true, value: { scenario, outcome: label } }
}

const ICON = 132

function scenarioCard(
  p: z.infer<typeof ScenarioCardSchema>
): Parsed<GameCardFrame> {
  const found = lookUp(p.scenario, p.outcome)
  if (!found.ok) return found
  const { scenario, outcome } = found.value
  const kicker = setText(PHASE_TITLES[scenario.phase], KICKER, at(TOP), 1)
  const y = under(kicker, TOP, KICKER, 20)
  const textX = X + ICON + 36
  const nameStyle = barlow(800, 76, INK.text, 1.1)
  const name = setText(
    scenario.name,
    nameStyle,
    at(y, textX, WIDTH - ICON - 36),
    2
  )
  const outcomeStyle = barlow(600, 52, INK.accent)
  const came =
    outcome === null
      ? null
      : setText(
          outcome,
          outcomeStyle,
          at(under(name, y, nameStyle, 4), textX, WIDTH - ICON - 36),
          1
        )
  // The words sit level with the icon's middle when they are shorter than it.
  const foot = came ?? name
  const dy = foot ? Math.max(0, (ICON - (bottomOf(foot) - y)) / 2) : 0
  return carded(
    "scenario",
    [
      ["scenario's phase", kicker],
      ["scenario's name", lowered(name, dy)],
      ["outcome", lowered(came, dy)],
    ],
    [{ box: square(X, y, ICON), paths: scenario.icon, colour: INK.accent }]
  )
}

const MARK = 72
const ARROW = 48

function chainCard(p: z.infer<typeof ChainSchema>): Parsed<GameCardFrame> {
  const kicker = setText(p.kicker, KICKER, at(TOP), 1)
  const named: Named = [["chain's kicker", kicker]]
  const glyphs: Array<Glyph> = []
  const problems: Array<string> = []
  const textX = X + MARK + 28
  const textWidth = WIDTH - MARK - 28
  const subStyle = barlow(600, 38, INK.muted)
  const mainStyle = barlow(800, 64, INK.text, 1.1)
  let y = p.kicker === "" ? TOP : under(kicker, TOP, KICKER, 20)
  p.steps.forEach((step, i) => {
    const nth = `${ordinal(i + 1)} step`
    if (i > 0) {
      glyphs.push({
        box: square(X + (MARK - ARROW) / 2, y, ARROW),
        paths: ARROW_DOWN,
        colour: INK.accent,
      })
      y += ARROW + 12
    }
    let bottom = y + MARK
    if ("scenario" in step) {
      const found = lookUp(step.scenario, step.outcome)
      if (!found.ok) {
        problems.push(...found.problems.map((q) => `the ${nth}: ${q}`))
        return
      }
      const { scenario, outcome } = found.value
      glyphs.push({
        box: square(X, y, MARK),
        paths: scenario.icon,
        colour: INK.accent,
      })
      const sub = setText(scenario.name, subStyle, at(y, textX, textWidth), 1)
      const main = setText(
        outcome ?? "",
        mainStyle,
        at(under(sub, y, subStyle, 0), textX, textWidth),
        2
      )
      named.push([`${nth}'s scenario`, sub], [nth, main])
      if (main) bottom = Math.max(bottom, bottomOf(main))
    } else {
      glyphs.push({
        box: square(X + 12, y + 12, MARK - 24),
        paths: RING,
        colour: INK.muted,
      })
      const main = setText(step.text, mainStyle, at(y, textX, textWidth), 2)
      named.push([nth, main])
      if (main) bottom = Math.max(bottom, bottomOf(main))
    }
    y = bottom + 12
  })
  if (problems.length > 0) return { ok: false, problems }
  return carded("chain", named, glyphs)
}

/** Each number of wins at which the best seed reachable improves. */
export function pathSteps(
  paths: ReadonlyArray<number | null>
): ReadonlyArray<{ readonly wins: number; readonly seed: number }> {
  const steps: Array<{ wins: number; seed: number }> = []
  let best: number | null = null
  paths.forEach((seed, wins) => {
    if (seed !== null && (best === null || seed < best)) {
      steps.push({ wins, seed })
      best = seed
    }
  })
  return steps
}

function pathCard(p: z.infer<typeof PathSchema>): Parsed<GameCardFrame> {
  const kicker = setText(words.pathKicker(p.week), KICKER, at(TOP), 1)
  const headStyle = barlow(800, 72, INK.text, 1.1)
  const headY = under(kicker, TOP, KICKER, 12)
  const head = setText(words.pathHeadline(p.team), headStyle, at(headY), 1)
  const named: Named = [
    ["path's kicker", kicker],
    ["path's headline", head],
  ]
  const winStyle = barlow(800, 54, INK.text, 1.3)
  const seedStyle = barlow(600, 54, INK.muted, 1.3)
  const column = 280
  let y = under(head, headY, headStyle, 20)
  const steps = pathSteps(p.paths)
  if (steps.length === 0) {
    named.push(["path", setText(words.noWayIn, seedStyle, at(y), 1)])
  }
  for (const [i, { wins, seed }] of steps.entries()) {
    named.push(
      [
        `wins on row ${i + 1}`,
        setText(words.wins(wins), winStyle, at(y, X, column), 1),
      ],
      [
        `seed on row ${i + 1}`,
        setText(
          words.seed(seed),
          seedStyle,
          at(y, X + column, WIDTH - column),
          1
        ),
      ]
    )
    y += winStyle.sizePx * winStyle.lineHeight
  }
  return carded("path", named, [])
}

/** The card's words set and its panel drawn, or every reason it can't be. */
export function drawGameCard(p: GameCardParams): Parsed<GameCardFrame> {
  switch (p.template) {
    case "stat": {
      return statCard(p)
    }
    case "score": {
      return scoreCard(p)
    }
    case "scenario": {
      return scenarioCard(p)
    }
    case "chain": {
      return chainCard(p)
    }
    case "path": {
      return pathCard(p)
    }
    default: {
      return assertNever(p)
    }
  }
}

/** The boxes a game card covers. */
export const gameCardBoxes = (f: GameCardFrame): ReadonlyArray<Box> => [
  ...f.panels.map((p) => p.box),
  ...f.blocks.map((b) => b.box),
  ...f.glyphs.map((g) => g.box),
]
