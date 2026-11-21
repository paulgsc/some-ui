/**
 * The genres: each feed home makes videos of, its paint and its shape
 * (EPISODES1's prototype, #3030), as data in the cast's form (`./cast`), so
 * Studio's genre row (`apps/www/src/components/studio/genre-thumbs.tsx`)
 * draws it with React and an episode's thumbnail (`@some-ui/video-render`'s
 * `thumbnail`, C1026) draws the same tree as text: one drawing wherever it
 * is drawn.
 *
 * One hue and one shape per genre, so they stay apart at a row's size and
 * for colour-blind eyes. No genre takes sky or leaf, which a status dot means
 * (C410). Fixed art, the same in every theme, as a video's thumbnail is.
 * Every shape is paths and rects, never text, so it draws the same with no
 * font at all.
 */

import type { CastNode } from "./cast"

/** The genres, a closed set: www's `FEEDS` is held to it by its type. */
export const GENRES = [
  "call",
  "cards-essay",
  "interview-essay",
  "playoff-delta",
  "report",
  "rust-essay",
] as const

export type Genre = (typeof GENRES)[number]

/** A genre's hue, and the ground it sits on. */
export type Paint = { readonly hue: string; readonly ground: string }

/** Each genre's hue on its ground: honey, sand, lavender, lime, coral and rose. */
export const GENRE_PAINT = {
  call: { hue: "#e8a93c", ground: "#2e2416" },
  "cards-essay": { hue: "#e3d2ab", ground: "#29241a" },
  "interview-essay": { hue: "#b5a6ec", ground: "#201b33" },
  "playoff-delta": { hue: "#c9d46a", ground: "#252914" },
  report: { hue: "#ef8a6b", ground: "#2e1a14" },
  "rust-essay": { hue: "#e58fb6", ground: "#2d1724" },
} as const satisfies Record<Genre, Paint>

/** The box every genre's shape is drawn in. */
export const GENRE_VIEW_BOX = "0 0 320 180"

/** A paint's dim: its hue at a third. */
export const dimOf = (hue: string): string => `${hue}55`

const el = (
  tag: string,
  attrs: Readonly<Record<string, string | number>>
): CastNode => ({ tag, attrs })

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  fill: string,
  more: Readonly<Record<string, string | number>> = {}
): CastNode => el("rect", { x, y, width, height, rx, fill, ...more })

const round = {
  fill: "none",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const

const CALL_COLUMNS = [
  { items: 3, column: 0 },
  { items: 2, column: 1 },
  { items: 4, column: 2 },
] as const

/** The board, the call's first chapter, and a speech bubble. */
const call = ({ hue, dim }: Colours): Array<CastNode> => [
  ...CALL_COLUMNS.flatMap(({ items, column }) => {
    const x = 62 + column * 70
    return [
      rect(x, 34, 58, 112, 8, "none", {
        stroke: hue,
        "stroke-width": 3,
        opacity: 0.9,
      }),
      rect(x + 8, 42, 30, 5, 2.5, hue),
      ...Array.from({ length: items }, (_, i) =>
        rect(x + 8, 56 + i * 21, 42, 15, 4, i === 0 && column === 1 ? hue : dim)
      ),
    ]
  }),
  el("path", {
    d: "M262 28h34a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-20l-10 9v-9h-4a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z",
    fill: hue,
  }),
]

/** A fan of cards, the top one checked: every claim checked. */
const cards = ({ hue, dim, ground }: Colours): Array<CastNode> => [
  ...[
    { turn: -14, stroke: dim },
    { turn: 9, stroke: dim },
    { turn: 0, stroke: hue },
  ].map(({ turn, stroke }) =>
    rect(122, 40, 76, 104, 9, ground, {
      stroke,
      "stroke-width": 3,
      transform: `rotate(${String(turn)} 160 96)`,
    })
  ),
  rect(134, 56, 40, 6, 3, hue),
  rect(134, 70, 52, 5, 2.5, dim),
  rect(134, 82, 46, 5, 2.5, dim),
  el("circle", { cx: 160, cy: 118, r: 13, fill: hue }),
  el("path", {
    d: "M153 118l5 5 9-10",
    ...round,
    stroke: ground,
    "stroke-width": 3.5,
  }),
]

/** Paths to the playoff line, one reaching it, and a delta. */
const delta = ({ hue, dim }: Colours): Array<CastNode> => [
  el("line", {
    x1: 250,
    y1: 26,
    x2: 250,
    y2: 150,
    stroke: hue,
    "stroke-width": 2.5,
    "stroke-dasharray": "6 6",
  }),
  el("polyline", {
    points: "40,128 90,116 140,120 190,86 236,60 262,48",
    ...round,
    stroke: hue,
    "stroke-width": 5,
  }),
  el("polyline", {
    points: "40,104 90,108 140,96 190,112 236,128",
    ...round,
    stroke: dim,
    "stroke-width": 4,
  }),
  el("circle", { cx: 262, cy: 48, r: 7, fill: hue }),
  el("path", {
    d: "M58 30 L84 72 H32 Z",
    fill: "none",
    stroke: hue,
    "stroke-width": 5,
    "stroke-linejoin": "round",
  }),
]

/** The waveform's bars: each one's height and where it stands. */
const INTERVIEW_BARS = [10, 22, 14, 28, 18, 24, 10].map((h, i) => ({
  h,
  x: 182 + i * 10,
}))

/** A question and an answer, the answer said aloud. */
const interview = ({ hue, ground }: Colours): Array<CastNode> => [
  el("path", {
    d: "M70 44h92a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12h-56l-20 18v-18h-16a12 12 0 0 1-12-12V56a12 12 0 0 1 12-12z",
    fill: hue,
  }),
  // The question mark, drawn: a hook and its dot.
  el("path", {
    d: "M107 66c0-6 4-9 9-9s9 3 9 8c0 6-8 7-8 13",
    ...round,
    stroke: ground,
    "stroke-width": 5.5,
  }),
  el("circle", { cx: 117, cy: 89, r: 3.4, fill: ground }),
  el("path", {
    d: "M162 76h88a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12h-14v16l-18-16h-56a12 12 0 0 1-12-12V88a12 12 0 0 1 12-12z",
    fill: ground,
    stroke: hue,
    "stroke-width": 3.5,
  }),
  ...INTERVIEW_BARS.map(({ h, x }) => rect(x, 106 - h / 2, 5, h, 2.5, hue)),
]

/** Each wing's pair of bars: last week's, dim, then this week's, lit. */
const REPORT_PAIRS = [
  [44, 62],
  [70, 52],
  [30, 48],
  [56, 84],
].map(([last = 0, now = 0], i) => ({ last, now, x: 74 + i * 46 }))

/** A statement's bars over its baseline: this week beside last. */
const report = ({ hue, dim }: Colours): Array<CastNode> => [
  rect(62, 132, 196, 3, 1.5, hue),
  ...REPORT_PAIRS.flatMap(({ last, now, x }) => [
    rect(x, 130 - last, 14, last, 3, dim),
    rect(x + 17, 130 - now, 14, now, 3, hue),
  ]),
]

const RUST_BARS = [14, 30, 22, 44, 34, 52, 28, 40, 18, 32, 12].map((h, i) => ({
  h,
  x: 194 + i * 9,
  lit: i % 3 === 1,
}))

/** A cog around braces, beside a waveform: every essay holds your voice. */
const rust = ({ hue, dim, ground }: Colours): Array<CastNode> => [
  ...Array.from({ length: 10 }, (_, i) =>
    rect(113, 40, 14, 18, 3, hue, {
      transform: `rotate(${String(i * 36)} 120 90)`,
    })
  ),
  el("circle", { cx: 120, cy: 90, r: 40, fill: hue }),
  el("circle", { cx: 120, cy: 90, r: 27, fill: ground }),
  // The braces, drawn.
  el("path", {
    d: "M114 78c-5 0-6 2-6 6v2c0 3-1 4-4 4 3 0 4 1 4 4v2c0 4 1 6 6 6M126 78c5 0 6 2 6 6v2c0 3 1 4 4 4-3 0-4 1-4 4v2c0 4-1 6-6 6",
    ...round,
    stroke: hue,
    "stroke-width": 3.5,
  }),
  ...RUST_BARS.map(({ h, x, lit }) =>
    rect(x, 90 - h / 2, 5, h, 2.5, lit ? hue : dim)
  ),
]

type Colours = {
  readonly hue: string
  readonly dim: string
  readonly ground: string
}

const SHAPES: Readonly<Record<Genre, (c: Colours) => Array<CastNode>>> = {
  call,
  "cards-essay": cards,
  "interview-essay": interview,
  "playoff-delta": delta,
  report,
  "rust-essay": rust,
}

/**
 * `genre`'s shape in its own paint, as the children of a
 * `<svg viewBox={GENRE_VIEW_BOX}>`, with no ground: a host lays it on the
 * genre's ground or on its own.
 */
export const genreNodes = (genre: Genre): ReadonlyArray<CastNode> => {
  const { hue, ground } = GENRE_PAINT[genre]
  return SHAPES[genre]({ hue, dim: dimOf(hue), ground })
}

/**
 * `genre`'s stock art (EPISODES2, #3067): its shape on its ground, over a
 * row of dots, filling the box. Studio shows it where an episode has no
 * thumbnail of its own.
 */
export const genreArt = (genre: Genre): ReadonlyArray<CastNode> => {
  const { hue, ground } = GENRE_PAINT[genre]
  return [
    el("rect", { width: 320, height: 180, fill: ground }),
    ...Array.from({ length: 9 }, (_, i) =>
      el("circle", { cx: 20 + i * 35, cy: 164, r: 1.6, fill: dimOf(hue) })
    ),
    ...genreNodes(genre),
  ]
}
