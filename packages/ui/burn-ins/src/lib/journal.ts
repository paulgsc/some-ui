/**
 * The Build Journal shorts' text, as two burn-in kinds in one design, `v1`:
 *
 * - `headline`, over a recorded scene: the kicker, the headline on one row,
 *   and the line saying how the picture was recorded, in the header band;
 * - `card`, over the series' ground: the same kicker and a headline of up to
 *   two rows, then a panel in the picture's window holding the card's body
 *   and its note, or, for a slot, the body under "Native clip to come".
 *
 * `v1` follows the layout and colours of the build-journal skill's
 * `render.py`, which drew every short published so far, in the burn-ins' one
 * font and sizes, with the card's panel kept to the body region. It is a new
 * design, not a copy: a short `render.py` drew is not redrawn by it.
 * Its params are what `@some-ui/video-render`'s `fromTimelineV1` writes. The
 * text never changes over a scene, so the frame is the same at every time.
 *
 * Text that does not fit is refused with the reason, never cut or shrunk
 * past the floor. An empty field draws nothing, as in `render.py`. Each
 * part is set from the regions of the frame it is drawn for (`./geometry`):
 * in the short, exactly where `render.py` set it.
 */

import { z } from "zod"

import type { Box, Geometry } from "./geometry"
import type { Parsed } from "./parsed"
import {
  barlow,
  bottomOf,
  fitLine,
  setText,
  type At,
  type TextBlock,
} from "./text"

export const JOURNAL_DESIGNS = ["v1"] as const

/** `render.py`'s palette. Video colours, not the app's, so literals. */
export const INK = {
  /** The Build Journal series' ground, behind the picture's window. */
  ground: "#111821",
  panel: "#182331",
  edge: "#344758",
  text: "#cbd5e1",
  muted: "#91a4b8",
  accent: "#79b8b1",
} as const

/** A rounded panel drawn under a card's text. */
export type Panel = {
  readonly box: Box
  readonly fill: string
  readonly edge: string
  readonly edgePx: number
  readonly radiusPx: number
}

/** What a text burn-in shows: the same at every moment of its scene. */
export type TextFrame = {
  readonly panels: ReadonlyArray<Panel>
  readonly blocks: ReadonlyArray<TextBlock>
}

/**
 * A row of the header, `dy` below its top: from its left edge across its
 * width, as `render.py` set them (54 px in, 972 wide, from 40 px down, in
 * the short).
 */
const headerRow = (g: Geometry, dy: number): At => ({
  x: g.regions.header.x,
  y: g.regions.header.y + dy,
  width: g.regions.header.width,
})

/** How far below the header's top each of its rows starts. */
const KICKER_DY = 22
const HEADLINE_DY = 64
const LINE_DY = 150

export const HeadlineParamsSchema = z.object({
  kicker: z.string().default(""),
  headline: z.string().default(""),
  line: z.string().default(""),
})

export const CardParamsSchema = z.object({
  kicker: z.string().default(""),
  headline: z.string().default(""),
  body: z.string().default(""),
  note: z.string().default(""),
  /** A native clip still to come in this card's place. */
  slot: z.boolean().default(false),
})

export type HeadlineParams = z.infer<typeof HeadlineParamsSchema>
export type CardParams = z.infer<typeof CardParamsSchema>

export const kicker = (text: string, g: Geometry): TextBlock | null =>
  setText(text, barlow(800, 30, INK.accent), headerRow(g, KICKER_DY), 1)

export const blocksOf = (
  named: ReadonlyArray<readonly [string, TextBlock | null]>
): Parsed<TextFrame> => {
  const problems = named.flatMap(([name, b]) =>
    b === null ? [`the ${name} doesn't fit`] : []
  )
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    value: {
      panels: [],
      blocks: named.flatMap(([, b]) => (b && b.rows.length > 0 ? [b] : [])),
    },
  }
}

export function headlineFrame(
  p: HeadlineParams,
  g: Geometry
): Parsed<TextFrame> {
  return blocksOf([
    ["kicker", kicker(p.kicker, g)],
    [
      "headline",
      fitLine(
        p.headline,
        barlow(800, 60, INK.text),
        headerRow(g, HEADLINE_DY),
        44
      ),
    ],
    [
      "line",
      fitLine(p.line, barlow(600, 30, INK.muted), headerRow(g, LINE_DY), 22),
    ],
  ])
}

/** Where a card's panel and its text sit in a frame. */
export type CardSpace = {
  /** The body region, where the picture's window is. */
  readonly panel: Panel
  /** Text inside the panel: in from its edges as `render.py` set it. */
  readonly inner: At
  /** How far down the panel text may reach. */
  readonly innerBottom: number
}

export function cardSpace(g: Geometry): CardSpace {
  const box = g.regions.body
  return {
    panel: {
      box,
      fill: INK.panel,
      edge: INK.edge,
      edgePx: 2,
      radiusPx: 28,
    },
    inner: { x: box.x + 56, y: box.y + 90, width: box.width - 112 },
    innerBottom: box.y + box.height - 56,
  }
}

/** Rows of `lineHeight * size` that fit from `y` to the panel's foot. */
const rowsLeft = (
  space: CardSpace,
  y: number,
  sizePx: number,
  lineHeight = 1.25
): number => Math.floor((space.innerBottom - y) / (sizePx * lineHeight))

/** A card's headline: up to two rows under the kicker. */
export const cardHeadline = (text: string, g: Geometry): TextBlock | null =>
  setText(text, barlow(800, 54, INK.text), headerRow(g, HEADLINE_DY), 2)

export function cardFrame(p: CardParams, g: Geometry): Parsed<TextFrame> {
  const space = cardSpace(g)
  const { inner } = space
  const head = cardHeadline(p.headline, g)
  const inside: Array<readonly [string, TextBlock | null]> = []
  if (p.slot) {
    const label = setText(
      "Native clip to come",
      { ...barlow(800, 34, INK.accent), uppercase: true },
      inner,
      1
    )
    const y = inner.y + 70
    inside.push(
      ["slot's label", label],
      [
        "body",
        setText(
          p.body,
          barlow(800, 48, INK.text),
          { ...inner, y },
          rowsLeft(space, y, 48)
        ),
      ]
    )
  } else {
    const body = setText(
      p.body,
      barlow(800, 56, INK.text),
      inner,
      rowsLeft(space, inner.y, 56)
    )
    inside.push(["body", body])
    if (p.note !== "") {
      const y = (body ? bottomOf(body) : inner.y) + 50
      inside.push([
        "note",
        setText(
          p.note,
          barlow(600, 40, INK.muted),
          { ...inner, y },
          rowsLeft(space, y, 40)
        ),
      ])
    }
  }
  const fitted = blocksOf([
    ["kicker", kicker(p.kicker, g)],
    ["headline", head],
    ...inside,
  ])
  return fitted.ok
    ? {
        ok: true,
        value: { panels: [space.panel], blocks: fitted.value.blocks },
      }
    : fitted
}

/** The boxes a text frame covers. */
export const textBoxes = (frame: TextFrame): ReadonlyArray<Box> => [
  ...frame.panels.map((p) => p.box),
  ...frame.blocks.map((b) => b.box),
]
