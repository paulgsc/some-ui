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
import { REGIONS, type Box } from "./geometry"
import {
  blocksOf,
  CARD_INNER,
  CARD_INNER_BOTTOM,
  CARD_PANEL,
  cardHeadline,
  INK,
  kicker,
  textBoxes,
  type Panel,
} from "./journal"
import type { Parsed } from "./parsed"
import { barlow, setText, type TextBlock } from "./text"
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
const heading = (part: string, headline: string): Named => [
  [`${part}'s kicker`, kicker(WORDS.authorship.kicker)],
  [`${part}'s headline`, cardHeadline(headline)],
]

/** A part over a bare card: its panel, its words set, its cells. */
const onCard = (
  part: "intro" | "end",
  named: Named,
  cells: ReadonlyArray<Cell>
): Parsed<AuthorshipFrame> => {
  const set = blocksOf(named)
  return set.ok
    ? {
        ok: true,
        value: { part, cells, panels: [CARD_PANEL], blocks: set.value.blocks },
      }
    : set
}

/** The intro: each actor's cell and what it stands for, then the grammar. */
function introFrame(): Parsed<AuthorshipFrame> {
  const words = WORDS.authorship
  const cells: Array<Cell> = []
  const named: Array<readonly [string, TextBlock | null]> = [
    ...heading("intro", words.introHeadline),
  ]
  const textX = CARD_INNER.x + 96
  const textWidth = CARD_INNER.width - 96
  ACTORS.forEach((actor, i) => {
    const y = CARD_INNER.y + i * 124
    cells.push(key(actor, square(CARD_INNER.x, y, 64), "origin", true))
    named.push(
      [
        `intro's ${actor} name`,
        setText(
          words.actors[actor].name,
          barlow(800, 44, INK.text),
          { x: textX, y: y - 4, width: textWidth },
          1
        ),
      ],
      [
        `intro's ${actor} line`,
        setText(
          words.actors[actor].about,
          barlow(600, 30, INK.muted),
          { x: textX, y: y + 52, width: textWidth },
          1
        ),
      ]
    )
  })
  const grammar = [
    ["filled", words.grammar.origin, "origin", false],
    ["half filled", words.grammar.wording, "wording", false],
    ["outlined", words.grammar.hand, null, true],
  ] as const
  grammar.forEach(([name, text, idea, hand], i) => {
    const y = CARD_INNER.y + 4 * 124 + 40 + i * 76
    cells.push(key("agent", square(CARD_INNER.x + 8, y, 48), idea, hand))
    named.push([
      `intro's ${name} line`,
      setText(
        text,
        barlow(600, 34, INK.text),
        { x: textX, y: y + 2, width: textWidth },
        1
      ),
    ])
  })
  return onCard("intro", named, cells)
}

/** The mark: the scene's cells, small, down the gutter. */
const markFrame = (s: AuthoredScene): AuthorshipFrame => ({
  part: "mark",
  cells: claims(
    s,
    { x: REGIONS.gutter.x + 4, y: REGIONS.gutter.y + 12 },
    34,
    12,
    false
  ),
  panels: [],
  blocks: [],
})

const ROWS_PER_COLUMN = 12
const ROW = 54
const COLUMN = 430
const LINK_PX = 26

/** The end card: a legend, the grammar, then each scene's cells, numbered. */
function endFrame(
  between: ReadonlyArray<AuthoredScene>
): Parsed<AuthorshipFrame> {
  const words = WORDS.authorship
  const cells: Array<Cell> = []
  const named: Array<readonly [string, TextBlock | null]> = [
    ...heading("end card", words.endHeadline),
  ]
  ACTORS.forEach((actor, i) => {
    const x = CARD_INNER.x + i * 215
    cells.push(key(actor, square(x, CARD_INNER.y, 32), "origin", false))
    named.push([
      `end card's ${actor} name`,
      setText(
        words.actors[actor].name,
        barlow(600, 30, INK.text),
        { x: x + 44, y: CARD_INNER.y - 2, width: 160 },
        1
      ),
    ])
  })
  named.push([
    "end card's grammar",
    setText(
      words.grammarShort,
      barlow(600, 28, INK.muted),
      { x: CARD_INNER.x, y: CARD_INNER.y + 60, width: CARD_INNER.width },
      1
    ),
  ])
  const top = CARD_INNER.y + 130
  between.forEach((s, i) => {
    const x = CARD_INNER.x + Math.floor(i / ROWS_PER_COLUMN) * COLUMN
    const y = top + (i % ROWS_PER_COLUMN) * ROW
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
  // The link on a row of its own, under what it is: it has no space to break at.
  const linkY = CARD_INNER_BOTTOM - LINK_PX * 1.25
  const labelY = linkY - LINK_PX * 1.25
  const row = (y: number): { x: number; y: number; width: number } => ({
    x: CARD_INNER.x,
    y,
    width: CARD_INNER.width,
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
  const lastY = top + Math.min(between.length, ROWS_PER_COLUMN) * ROW
  const result = onCard("end", named, cells)
  if (result.ok && lastY > labelY) {
    return { ok: false, problems: ["the end card's record doesn't fit"] }
  }
  return result
}

/** Every part drawn from checked params, or every reason one can't be. */
export function drawAuthorship(p: AuthorshipParams): Parsed<AuthorshipDrawing> {
  const intro = introFrame()
  const end = endFrame(p.scenes.slice(1, -1))
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
      marks: p.scenes.map(markFrame),
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
