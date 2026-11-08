/**
 * The authorship mark (STUDIO ST16, #2274): whose idea each scene presents
 * and whose hands made what is on screen, shown as the video plays, the way
 * an OST cover lights each singer for their lines. A credit, styled like the
 * rest of the video: no warning shapes, no score, no share of anything.
 *
 * Its params are never written by hand: `@some-ui/video-render`'s
 * `authorshipParams` reads them from the cut list and the step table, and
 * the cut list refuses any written for it. They are each scene's start, its
 * idea's origin and wording, and its hands.
 *
 * Design `cells-v1`: one cell per actor, always in the same place (position
 * says who, never how much). The idea's origin fills its cell, its wording,
 * when someone else's, half fills theirs, and the hands outline theirs. It
 * has three parts in time:
 *
 * - over the first scene (a bare card), the intro, teaching that grammar;
 * - over every scene between, the mark, small in the gutter;
 * - over the last scene (a bare card), the end card: each scene's record,
 *   and the link to a page that draws it (`./authorship-link`).
 *
 * A cell is a `claim` (what the data says about a scene) or a `key` (a
 * swatch in a legend). No claim lights the owner that the scene's data does
 * not (`__tests__/authorship.test.ts`).
 */

import { z } from "zod"

import { recordLink } from "./authorship-link"
import { inside, type Box, type Geometry } from "./geometry"
import {
  blocksOf,
  cardHeadline,
  cardSpace,
  INK,
  kicker,
  textBoxes,
  type CardSpace,
  type Panel,
} from "./journal"
import type { Parsed } from "./parsed"
import { barlow, setText, widthOf, type TextBlock } from "./text"
import { WORDS } from "./words"

export const AUTHORSHIP_DESIGNS = ["cells-v1"] as const

const ACTORS = ["you", "agent", "code", "source"] as const
export type Actor = (typeof ACTORS)[number]

/** Each actor's colour. Video colours, not the app's, so literals. */
const COLOUR: Readonly<Record<Actor, string>> = {
  you: "#f2b766",
  agent: INK.accent,
  code: "#8fa7c9",
  source: "#c6a4e0",
}

const SceneSchema = z.object({
  startMs: z.number().nonnegative(),
  origin: z.enum(["you", "agent", "source"]),
  wording: z.enum(["you", "agent"]),
  hands: z.array(z.enum(["you", "agent", "code"])),
})

export type AuthoredScene = z.infer<typeof SceneSchema>

/** The most scenes between the intro and the end card that its record holds. */
export const MOST_SCENES = 24

export const AuthorshipParamsSchema = z
  .object({
    scenes: z
      .array(SceneSchema)
      .min(3)
      .max(MOST_SCENES + 2),
    endMs: z.number().positive(),
  })
  .refine((p) => p.scenes[0]?.startMs === 0, {
    message: "the first scene starts the video",
  })
  .refine(
    (p) =>
      p.scenes.every(
        (s, i) => i === 0 || s.startMs > (p.scenes[i - 1]?.startMs ?? 0)
      ) && (p.scenes.at(-1)?.startMs ?? 0) < p.endMs,
    { message: "each scene starts after the one before, and before the end" }
  )

export type AuthorshipParams = z.infer<typeof AuthorshipParamsSchema>

/** One actor's cell: what it claims for a scene, or a swatch in a legend. */
export type Cell = {
  readonly actor: Actor
  readonly box: Box
  readonly colour: string
  readonly role: "claim" | "key"
  /** Filled for the idea's origin, half filled for its wording. */
  readonly idea: "origin" | "wording" | null
  /** Outlined for a hand that made the scene. */
  readonly hand: boolean
}

export type AuthorshipFrame = {
  readonly part: "intro" | "mark" | "end"
  readonly cells: ReadonlyArray<Cell>
  readonly panels: ReadonlyArray<Panel>
  readonly blocks: ReadonlyArray<TextBlock>
}

/** The three parts, drawn once each; `frameAt` picks one by time. */
export type AuthorshipDrawing = {
  readonly scenes: ReadonlyArray<AuthoredScene>
  readonly intro: AuthorshipFrame
  readonly marks: ReadonlyArray<AuthorshipFrame>
  readonly end: AuthorshipFrame
}

const ideaOf = (s: AuthoredScene, actor: Actor): Cell["idea"] =>
  s.origin === actor ? "origin" : s.wording === actor ? "wording" : null

const handOf = (s: AuthoredScene, actor: Actor): boolean =>
  s.hands.some((h) => h === actor)

/** A scene's cells in a column or a row, from `at`, `size` square, `gap` apart. */
function claims(
  s: AuthoredScene,
  at: { readonly x: number; readonly y: number },
  size: number,
  gap: number,
  across: boolean
): ReadonlyArray<Cell> {
  return ACTORS.map((actor, i) => ({
    actor,
    box: {
      x: across ? at.x + i * (size + gap) : at.x,
      y: across ? at.y : at.y + i * (size + gap),
      width: size,
      height: size,
    },
    colour: COLOUR[actor],
    role: "claim",
    idea: ideaOf(s, actor),
    hand: handOf(s, actor),
  }))
}

const key = (
  actor: Actor,
  box: Box,
  idea: Cell["idea"],
  hand: boolean
): Cell => ({ actor, box, colour: COLOUR[actor], role: "key", idea, hand })

const square = (x: number, y: number, size: number): Box => ({
  x,
  y,
  width: size,
  height: size,
})

type Named = ReadonlyArray<readonly [string, TextBlock | null]>

/** A part's kicker and headline, as a Build Journal card has them. */
const heading = (part: string, headline: string, g: Geometry): Named => [
  [`${part}'s kicker`, kicker(WORDS.authorship.kicker, g)],
  [`${part}'s headline`, cardHeadline(headline, g)],
]

/** A part over a bare card: its panel, its words set, its cells. */
const onCard = (
  part: "intro" | "end",
  space: CardSpace,
  named: Named,
  cells: ReadonlyArray<Cell>
): Parsed<AuthorshipFrame> => {
  const set = blocksOf(named)
  return set.ok
    ? {
        ok: true,
        value: { part, cells, panels: [space.panel], blocks: set.value.blocks },
      }
    : set
}

/** An actor's row in the intro: its cell, and its name and line beside it. */
const ACTOR_ROW = 124
/** A grammar line's row in the intro, when they stack. */
const GRAMMAR_ROW = 76
/** How far in from a cell its words start. */
const TEXT_IN = 96
/** Between two grammar lines, when they share a row. */
const GRAMMAR_GAP = 48
const GRAMMAR_CELL = 48

/**
 * The intro: each actor's cell and what it stands for, then the grammar.
 * Where the card is tall enough (the short), the actors and the grammar
 * lines stack in one column; where it is not (the 16:9 frame), the actors
 * take two to a row and the grammar lines share one row under them. A part
 * that would reach past the card's text is refused, never drawn over the
 * region below.
 */
function introFrame(g: Geometry): Parsed<AuthorshipFrame> {
  const words = WORDS.authorship
  const space = cardSpace(g)
  const { inner } = space
  const grammar = [
    ["filled", words.grammar.origin, "origin", false],
    ["half filled", words.grammar.wording, "wording", false],
    ["outlined", words.grammar.hand, null, true],
  ] as const
  const stacked =
    inner.y +
      ACTORS.length * ACTOR_ROW +
      40 +
      (grammar.length - 1) * GRAMMAR_ROW +
      GRAMMAR_CELL <=
    space.innerBottom
  const perRow = stacked ? 1 : 2
  const column = inner.width / perRow
  const cells: Array<Cell> = []
  const own: Array<readonly [string, TextBlock | null]> = []
  ACTORS.forEach((actor, i) => {
    const x = inner.x + (i % perRow) * column
    const y = inner.y + Math.floor(i / perRow) * ACTOR_ROW
    const text = { x: x + TEXT_IN, width: column - TEXT_IN }
    cells.push(key(actor, square(x, y, 64), "origin", true))
    own.push(
      [
        `intro's ${actor} name`,
        setText(
          words.actors[actor].name,
          barlow(800, 44, INK.text),
          { ...text, y: y - 4 },
          1
        ),
      ],
      [
        `intro's ${actor} line`,
        setText(
          words.actors[actor].about,
          barlow(600, 30, INK.muted),
          { ...text, y: y + 52 },
          1
        ),
      ]
    )
  })
  const grammarStyle = barlow(600, 34, INK.text)
  const actorRows = Math.ceil(ACTORS.length / perRow)
  let across = inner.x
  grammar.forEach(([name, text, idea, hand], i) => {
    const x = stacked ? inner.x : across
    const y = stacked
      ? inner.y + actorRows * ACTOR_ROW + 40 + i * GRAMMAR_ROW
      : inner.y + actorRows * ACTOR_ROW
    const width = stacked
      ? inner.width - TEXT_IN
      : Math.ceil(widthOf(text, grammarStyle))
    cells.push(key("agent", square(x + 8, y, GRAMMAR_CELL), idea, hand))
    own.push([
      `intro's ${name} line`,
      setText(text, grammarStyle, { x: x + TEXT_IN, y: y + 2, width }, 1),
    ])
    across = x + TEXT_IN + width + GRAMMAR_GAP
  })
  // Across the card's text, and down from the panel's top to its text's foot.
  const top = space.panel.box.y
  const room: Box = {
    x: inner.x,
    y: top,
    width: inner.width,
    height: space.innerBottom - top,
  }
  const overflows = [
    ...cells.map((c) => c.box),
    ...own.flatMap(([, b]) => (b ? [b.box] : [])),
  ].some((box) => !inside(box, room))
  if (overflows) return { ok: false, problems: ["the intro doesn't fit"] }
  return onCard(
    "intro",
    space,
    [...heading("intro", words.introHeadline, g), ...own],
    cells
  )
}

/** The mark: the scene's cells, small, down the gutter. */
const markFrame = (s: AuthoredScene, g: Geometry): AuthorshipFrame => ({
  part: "mark",
  cells: claims(
    s,
    { x: g.regions.gutter.x + 4, y: g.regions.gutter.y + 12 },
    34,
    12,
    false
  ),
  panels: [],
  blocks: [],
})

const ROW = 54
const COLUMN = 430
/** A scene's entry: its number, then its four cells. */
const ENTRY = 64 + ACTORS.length * 36 + (ACTORS.length - 1) * 10
const LINK_PX = 26

/**
 * The end card: a legend, the grammar, then each scene's cells, numbered,
 * in as many rows as fit above the link and as many columns as fit across
 * (12 rows of 2 in the short, which holds `MOST_SCENES`; fewer in the
 * shorter 16:9 card, which refuses a record it can't hold).
 */
function endFrame(
  between: ReadonlyArray<AuthoredScene>,
  g: Geometry
): Parsed<AuthorshipFrame> {
  const words = WORDS.authorship
  const space = cardSpace(g)
  const { inner } = space
  const cells: Array<Cell> = []
  const named: Array<readonly [string, TextBlock | null]> = [
    ...heading("end card", words.endHeadline, g),
  ]
  ACTORS.forEach((actor, i) => {
    const x = inner.x + i * 215
    cells.push(key(actor, square(x, inner.y, 32), "origin", false))
    named.push([
      `end card's ${actor} name`,
      setText(
        words.actors[actor].name,
        barlow(600, 30, INK.text),
        { x: x + 44, y: inner.y - 2, width: 160 },
        1
      ),
    ])
  })
  named.push([
    "end card's grammar",
    setText(
      words.grammarShort,
      barlow(600, 28, INK.muted),
      { x: inner.x, y: inner.y + 60, width: inner.width },
      1
    ),
  ])
  // The link on a row of its own, under what it is: it has no space to break at.
  const linkY = space.innerBottom - LINK_PX * 1.25
  const labelY = linkY - LINK_PX * 1.25
  const top = inner.y + 130
  const rows = Math.floor((labelY - top) / ROW)
  const columns = Math.floor((inner.width - ENTRY) / COLUMN) + 1
  if (between.length > Math.max(0, rows) * columns) {
    return { ok: false, problems: ["the end card's record doesn't fit"] }
  }
  between.forEach((s, i) => {
    const x = inner.x + Math.floor(i / rows) * COLUMN
    const y = top + (i % rows) * ROW
    named.push([
      `end card's scene ${i + 1}`,
      setText(
        words.scene(i + 1),
        barlow(800, 34, INK.muted),
        { x, y: y - 2, width: 56 },
        1
      ),
    ])
    cells.push(...claims(s, { x: x + 64, y }, 36, 10, true))
  })
  const row = (y: number): { x: number; y: number; width: number } => ({
    x: inner.x,
    y,
    width: inner.width,
  })
  named.push(
    [
      "end card's link label",
      setText(words.linkLabel, barlow(600, LINK_PX, INK.muted), row(labelY), 1),
    ],
    [
      "end card's link",
      setText(
        recordLink(between),
        barlow(600, LINK_PX, INK.text),
        row(linkY),
        1
      ),
    ]
  )
  return onCard("end", space, named, cells)
}

/** Every part drawn from checked params, or every reason one can't be. */
export function drawAuthorship(
  p: AuthorshipParams,
  g: Geometry
): Parsed<AuthorshipDrawing> {
  const intro = introFrame(g)
  const end = endFrame(p.scenes.slice(1, -1), g)
  const problems = [
    ...(intro.ok ? [] : intro.problems),
    ...(end.ok ? [] : end.problems),
  ]
  if (!intro.ok || !end.ok) return { ok: false, problems }
  return {
    ok: true,
    value: {
      scenes: p.scenes,
      intro: intro.value,
      marks: p.scenes.map((s) => markFrame(s, g)),
      end: end.value,
    },
  }
}

/** What the mark shows `t` ms into the video. */
export function authorshipAt(d: AuthorshipDrawing, t: number): AuthorshipFrame {
  const last = d.scenes.length - 1
  let i = 0
  while (i < last && (d.scenes[i + 1]?.startMs ?? Infinity) <= t) i += 1
  if (i === 0) return d.intro
  if (i === last) return d.end
  const mark = d.marks[i]
  if (!mark) throw new Error(`scene ${i} has no mark`)
  return mark
}

/** The boxes a frame covers. */
export const authorshipBoxes = (f: AuthorshipFrame): ReadonlyArray<Box> => [
  ...textBoxes(f),
  ...f.cells.map((c) => c.box),
]
