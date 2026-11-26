/**
 * The cast: the characters that stand for the voices in a video's speaking
 * bubbles (PDA6, #2883). The owner is the mark itself, the mochi given
 * volume; the second voices, synthetic, are tin birds. Each is data, a tree
 * of SVG elements in a 96 box, so a page draws it with React and a
 * composition can draw the same tree as a file: one drawing, wherever it is
 * drawn, as `./mark` is for the mark.
 *
 * Depth comes from gradients alone (a radial body, a rim light clipped to the
 * silhouette, a contact shadow, glossy eyes), never SVG filters: gradients
 * raster the same way every time and cost little in a software rasterizer.
 * The ground is the theme's: the backdrop's rect carries `ground`, and the
 * host paints it (`fill-muted` in the essays' bubbles).
 *
 * Every gradient and clip is named through `id`, which a host makes unique
 * per drawing, so two bubbles on one page never share one.
 *
 * The moving parts are grouped and named (`data-part`: the mochi's figure,
 * face, eyes, brows, mouth, antennas, arms and the signs its loops show; the
 * tin owlet's eyes, lids, wings, tufts, key and lower beak), so a host that wants a
 * character alive can move them: with its own CSS (the public site's photo
 * slot blinks and sways the mochi, C1186) or as a pure function of time
 * (`./host`, the essays' living cast). A name draws nothing: a drawing that
 * doesn't move them is the same picture.
 */

import { MOCHI_BODY, MOCHI_CHEEK } from "./mark"

/** One SVG element: its tag, its attributes in SVG's own (kebab) spelling, and its children. */
export type CastNode = {
  readonly tag: string
  readonly attrs: Readonly<Record<string, string | number>>
  readonly children?: ReadonlyArray<CastNode>
}

/** The characters, a closed set: a new one is a new case here. */
export const CHARACTERS = ["mochi", "tin-owlet", "tin-sparrow"] as const

export type Character = (typeof CHARACTERS)[number]

/** Names a gradient or clip for one drawing: `id("body")` is unique to it. */
export type IdOf = (name: string) => string

export const el = (
  tag: string,
  attrs: Readonly<Record<string, string | number>>,
  children?: ReadonlyArray<CastNode>
): CastNode => (children ? { tag, attrs, children } : { tag, attrs })

const stop = (offset: number, color: string, opacity?: number): CastNode =>
  el("stop", {
    offset,
    "stop-color": color,
    ...(opacity === undefined ? {} : { "stop-opacity": opacity }),
  })

const radial = (
  id: string,
  at: { cx: number; cy: number; r: number },
  stops: ReadonlyArray<CastNode>
): CastNode => el("radialGradient", { id, ...at }, stops)

const linear = (
  id: string,
  to: { x1: number; y1: number; x2: number; y2: number },
  stops: ReadonlyArray<CastNode>
): CastNode => el("linearGradient", { id, ...to }, stops)

const url = (id: string): string => `url(#${id})`

/** The ground, lit from the upper left, and the contact shadow under a character. */
const stage = (
  id: IdOf,
  shadow: { cy: number; rx: number }
): Array<CastNode> => [
  el("defs", {}, [
    radial(id("glow"), { cx: 0.38, cy: 0.3, r: 0.8 }, [
      stop(0, "#ffffff", 0.22),
      stop(1, "#ffffff", 0),
    ]),
    radial(id("floor"), { cx: 0.5, cy: 0.5, r: 0.5 }, [
      stop(0, "#1a0f08", 0.42),
      stop(0.6, "#1a0f08", 0.16),
      stop(1, "#1a0f08", 0),
    ]),
  ]),
  el("rect", { width: 96, height: 96, "data-ground": "true" }),
  el("rect", {
    width: 96,
    height: 96,
    fill: url(id("glow")),
    "data-glow": "true",
  }),
  el("ellipse", {
    cx: 48,
    cy: shadow.cy,
    rx: shadow.rx,
    ry: 5.5,
    fill: url(id("floor")),
  }),
]

/**
 * A rim light: `d` stroked with a gradient clear on the key light's side
 * and bright on the far edge, clipped inside `d` so only its inner half
 * shows. A `transform` wraps both, so the clip is drawn in the path's own
 * space, never moved twice.
 */
const rim = (
  id: IdOf,
  d: string,
  colour: string,
  width: number,
  transform?: string
): Array<CastNode> => {
  const lit = [
    el("defs", {}, [
      linear(id("rim"), { x1: 0, y1: 0, x2: 1, y2: 0.6 }, [
        stop(0, colour, 0),
        stop(0.58, colour, 0),
        stop(1, colour, 0.95),
      ]),
      el("clipPath", { id: id("rim-clip") }, [el("path", { d })]),
    ]),
    el("path", {
      d,
      fill: "none",
      stroke: url(id("rim")),
      "stroke-width": width,
      "clip-path": url(id("rim-clip")),
    }),
  ]
  return transform === undefined ? lit : [el("g", { transform }, lit)]
}

/** A glossy eye: a dark iris and two highlights. */
const eye = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string
): Array<CastNode> => [
  el("ellipse", { cx, cy, rx, ry, fill }),
  el("ellipse", {
    cx: cx - rx * 0.32,
    cy: cy - ry * 0.38,
    rx: rx * 0.34,
    ry: ry * 0.3,
    fill: "#ffffff",
    opacity: 0.95,
  }),
  el("circle", {
    cx: cx + rx * 0.38,
    cy: cy + ry * 0.4,
    r: rx * 0.14,
    fill: "#ffffff",
    opacity: 0.7,
  }),
]

/** The mark's body, in the 96 box: centred, and a quarter larger. */
const MOCHI_AT = "translate(8 14) scale(1.25)"

/** The mochi's ink: its mouth, brows and every outline. */
export const INK = "#472b1b"

/** A part a loop shows: drawn, and clear until a loop sets its `opacity`. */
const hidden = (part: string, children: ReadonlyArray<CastNode>): CastNode =>
  el("g", { "data-part": part, opacity: 0 }, children)

/** A stroke outlined in ink, so it reads on a light ground and a dark one. */
const inked = (
  d: string,
  colour: string,
  width: number,
  extra: Readonly<Record<string, string | number>> = {}
): Array<CastNode> => [
  el("path", {
    d,
    fill: "none",
    stroke: INK,
    "stroke-width": Math.round((width + 1.8) * 100) / 100,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...extra,
  }),
  el("path", {
    d,
    fill: "none",
    stroke: colour,
    "stroke-width": width,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...extra,
  }),
]

/** A stubby arm from a shoulder, held out level; a loop turns it about the shoulder. */
const arm = (part: string, from: number, to: number): CastNode =>
  hidden(part, [
    ...inked(`M${String(from)} 60L${String(to)} 60`, "#f2ae55", 5.4),
  ])

/** A four-pointed glint, centred on 0 0. */
const SPARK = "M0 -4.5L1.1 -1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1 -1.1Z"

/**
 * What the mochi's loops show over its head and at its side (HOST4, #3525),
 * each clear until a loop shows it: a question, a bang, a bulb, a swirl,
 * three dots, a sweat drop, a cross vein, a sigh, glints and a football.
 * Each is drawn about 0 0 so a loop places it with one `translate`.
 */
const mochiSigns = (): Array<CastNode> => [
  hidden("question", [
    ...inked(
      "M-4.4 -6.2Q-4.4 -11 0 -11Q4.4 -11 4.4 -6.6Q4.4 -3.2 0 -1.6L0 2",
      "#fff2cf",
      3
    ),
    el("circle", { cx: 0, cy: 7.4, r: 2.6, fill: INK }),
    el("circle", { cx: 0, cy: 7.4, r: 1.7, fill: "#fff2cf" }),
  ]),
  hidden("bang", [
    ...inked("M0 -10L0 1.6", "#ff7a52", 3.4),
    el("circle", { cx: 0, cy: 7.2, r: 2.8, fill: INK }),
    el("circle", { cx: 0, cy: 7.2, r: 1.9, fill: "#ff7a52" }),
  ]),
  hidden("bulb", [
    el("circle", { cx: 0, cy: -2, r: 11, fill: "#ffe27a", opacity: 0.28 }),
    ...[0, 60, 120, 180, 240, 300].flatMap((a) =>
      inked("M0 -15L0 -12.4", "#ffe27a", 1.4, {
        transform: `rotate(${String(a)} 0 -2)`,
      })
    ),
    el("circle", {
      cx: 0,
      cy: -2,
      r: 6.4,
      fill: "#ffe27a",
      stroke: INK,
      "stroke-width": 0.9,
    }),
    el("path", {
      d: "M-2 -1.6L0 1L2 -1.6",
      fill: "none",
      stroke: "#c9781f",
      "stroke-width": 0.9,
    }),
    el("rect", {
      x: -3,
      y: 4,
      width: 6,
      height: 4.4,
      rx: 1.2,
      fill: "#b8c4cf",
      stroke: INK,
      "stroke-width": 0.9,
    }),
    el("ellipse", {
      cx: -2.2,
      cy: -4.6,
      rx: 1.8,
      ry: 1.2,
      fill: "#ffffff",
      opacity: 0.85,
    }),
  ]),
  hidden("swirl", [
    ...inked(
      "M0 0A1.2 1.2 0 1 1 2.4 0A2.6 2.6 0 1 1 -2.8 0A4 4 0 1 1 5.2 0A5.4 5.4 0 1 1 -5.6 0",
      "#c3a6ff",
      1.6
    ),
  ]),
  ...[1, 2, 3].map((n) =>
    hidden(`dot-${String(n)}`, [
      el("circle", { cx: 0, cy: 0, r: 2.6, fill: INK }),
      el("circle", { cx: 0, cy: 0, r: 1.7, fill: "#fff2cf" }),
    ])
  ),
  hidden("sweat", [
    el("path", {
      d: "M0 -4.6Q3.4 -0.4 3.4 1.6A3.4 3.4 0 0 1 -3.4 1.6Q-3.4 -0.4 0 -4.6Z",
      fill: "#a8dcff",
      stroke: "#2f6f99",
      "stroke-width": 0.8,
    }),
    el("ellipse", {
      cx: -1.1,
      cy: 1.2,
      rx: 0.8,
      ry: 1.3,
      fill: "#ffffff",
      opacity: 0.85,
    }),
  ]),
  hidden("vein", [
    ...inked(
      "M-4.4 -1.2Q-1.2 -1.2 -1.2 -4.4M1.2 -4.4Q1.2 -1.2 4.4 -1.2M4.4 1.2Q1.2 1.2 1.2 4.4M-1.2 4.4Q-1.2 1.2 -4.4 1.2",
      "#ff4a36",
      1.8
    ),
  ]),
  hidden("puff", [
    el("circle", {
      cx: 0,
      cy: 0,
      r: 3.2,
      fill: "#f4efe6",
      stroke: INK,
      "stroke-width": 0.7,
    }),
    el("circle", {
      cx: -3.6,
      cy: -1.4,
      r: 2.4,
      fill: "#f4efe6",
      stroke: INK,
      "stroke-width": 0.7,
    }),
    el("circle", {
      cx: -6.2,
      cy: 0.6,
      r: 1.7,
      fill: "#f4efe6",
      stroke: INK,
      "stroke-width": 0.7,
    }),
  ]),
  ...[1, 2, 3].map((n) =>
    hidden(`spark-${String(n)}`, [
      el("path", {
        d: SPARK,
        fill: "#fff2cf",
        stroke: INK,
        "stroke-width": 0.7,
      }),
    ])
  ),
]

/** A football, centred on 0 0, its long axis level. */
const football = (): CastNode =>
  hidden("football", [
    el("ellipse", {
      cx: 0,
      cy: 0,
      rx: 7,
      ry: 4.3,
      fill: "#8a4a22",
      stroke: INK,
      "stroke-width": 0.9,
    }),
    el("path", {
      d: "M-4.8 -2.6Q-4 0 -4.8 2.6M4.8 -2.6Q4 0 4.8 2.6",
      fill: "none",
      stroke: "#ffffff",
      "stroke-width": 0.9,
    }),
    el("path", {
      d: "M-2.4 -0.6H2.4M-1.4 -1.6V0.4M0 -1.6V0.4M1.4 -1.6V0.4",
      stroke: "#ffffff",
      "stroke-width": 0.7,
      "stroke-linecap": "round",
    }),
  ])

/**
 * The mochi, its moving parts named for a host (`./host`, `./host-mochi`):
 * `figure` holds all of it but its shadow, football and signs, so it squashes and
 * stretches whole from its feet; `face` holds what it feels with (cheeks,
 * eyes, brows, mouth). What only a loop shows (brows, the happy eyes,
 * arms, the signs, the football) is drawn clear, so the still mochi is the
 * same picture it always was.
 */
const mochi = (id: IdOf): Array<CastNode> => [
  el("defs", {}, [
    radial(id("body"), { cx: 0.36, cy: 0.3, r: 0.8 }, [
      stop(0, "#ffe2a8"),
      stop(0.45, "#f5b75b"),
      stop(1, "#c9781f"),
    ]),
    radial(id("glow-under"), { cx: 0.5, cy: 0.5, r: 0.5 }, [
      stop(0, "#ffd27a", 0.55),
      stop(1, "#ffd27a", 0),
    ]),
    linear(id("shine"), { x1: 0, y1: 0, x2: 0, y2: 1 }, [
      stop(0, "#ffffff", 0.95),
      stop(1, "#ffffff", 0.15),
    ]),
    radial(id("eye"), { cx: 0.4, cy: 0.35, r: 0.75 }, [
      stop(0, "#6b432a"),
      stop(1, "#2a170c"),
    ]),
  ]),
  ...stage(id, { cy: 85, rx: 32 }).map((node) =>
    node.tag === "ellipse"
      ? { ...node, attrs: { ...node.attrs, "data-part": "shadow" } }
      : node
  ),
  el("g", { "data-part": "figure" }, [
    el("ellipse", { cx: 38, cy: 83, rx: 6, ry: 3.2, fill: "#c27622" }),
    el("ellipse", { cx: 58, cy: 83, rx: 6, ry: 3.2, fill: "#c27622" }),
    ...[
      { d: "M40 27C38 20 34 15 29 13", tip: 28.5, part: "antenna-left" },
      { d: "M56 27C58 20 62 15 67 13", tip: 67.5, part: "antenna-right" },
    ].map(({ d, tip, part }) =>
      el("g", { "data-part": part }, [
        el("path", {
          d,
          fill: "none",
          stroke: "#6b432a",
          "stroke-width": 2,
          "stroke-linecap": "round",
        }),
        el("circle", { cx: tip, cy: 12.5, r: 3.2, fill: "#f5b75b" }),
        el("circle", {
          cx: tip - 0.9,
          cy: 11.4,
          r: 1.1,
          fill: "#ffffff",
          opacity: 0.8,
        }),
      ])
    ),
    arm("arm-left", 24, 8),
    arm("arm-right", 72, 88),
    el("path", { d: MOCHI_BODY, transform: MOCHI_AT, fill: url(id("body")) }),
    el("ellipse", {
      cx: 52,
      cy: 58,
      rx: 22,
      ry: 16,
      fill: url(id("glow-under")),
    }),
    el("ellipse", {
      cx: 34,
      cy: 38.5,
      rx: 7.5,
      ry: 3.8,
      transform: "rotate(-32 34 38.5)",
      fill: url(id("shine")),
    }),
    el("g", { "data-part": "face" }, [
      el("g", { "data-part": "cheeks", opacity: 0.7 }, [
        el("ellipse", {
          cx: 32.4,
          cy: 62,
          rx: 4.6,
          ry: 2.8,
          fill: MOCHI_CHEEK,
        }),
        el("ellipse", {
          cx: 63.6,
          cy: 62,
          rx: 4.6,
          ry: 2.8,
          fill: MOCHI_CHEEK,
        }),
      ]),
      el("g", { "data-part": "eyes" }, [
        ...eye(39.5, 55, 3.6, 4, url(id("eye"))),
        ...eye(56.5, 55, 3.6, 4, url(id("eye"))),
      ]),
      hidden("eyes-happy", [
        el("path", {
          d: "M35.6 56.6Q39.5 51 43.4 56.6M52.6 56.6Q56.5 51 60.4 56.6",
          fill: "none",
          stroke: "#2a170c",
          "stroke-width": 2.2,
          "stroke-linecap": "round",
        }),
      ]),
      ...[
        { part: "brow-left", d: "M36 48H43" },
        { part: "brow-right", d: "M53 48H60" },
      ].map(({ part, d }) =>
        hidden(part, [
          el("path", {
            d,
            fill: "none",
            stroke: INK,
            "stroke-width": 1.9,
            "stroke-linecap": "round",
          }),
        ])
      ),
      el("path", {
        d: "M43.6 62.2Q48 68.6 52.4 62.2Q48 64.4 43.6 62.2Z",
        fill: INK,
        "data-part": "mouth",
      }),
    ]),
    ...rim(id, MOCHI_BODY, "#fff2cf", 2.4, MOCHI_AT),
  ]),
  football(),
  ...mochiSigns(),
]

/** The synthetic voices' glow: the tutor's teal, the asker's lilac. */
const TEAL = "#4ff0d8"
const LILAC = "#c3a6ff"

const tinDefs = (id: IdOf, glow: string): CastNode =>
  el("defs", {}, [
    linear(id("tin"), { x1: 0, y1: 0, x2: 1, y2: 0.3 }, [
      stop(0, "#e9eef3"),
      stop(0.35, "#b8c4cf"),
      stop(0.55, "#eef3f7"),
      stop(1, "#6f7d8b"),
    ]),
    radial(id("tin-shade"), { cx: 0.5, cy: 0.15, r: 0.95 }, [
      stop(0, "#000000", 0),
      stop(1, "#1b2530", 0.5),
    ]),
    radial(id("lens"), { cx: 0.4, cy: 0.35, r: 0.7 }, [
      stop(0, "#34404b"),
      stop(1, "#080c10"),
    ]),
    radial(id("led"), { cx: 0.5, cy: 0.5, r: 0.5 }, [
      stop(0, glow, 0.8),
      stop(1, glow, 0),
    ]),
    linear(id("brass"), { x1: 0, y1: 0, x2: 1, y2: 1 }, [
      stop(0, "#f0d9a0"),
      stop(1, "#8f6d2f"),
    ]),
  ])

/** A camera-lens eye that glows: rings, a dark glass, a lit iris, a catchlight. */
const lens = (
  id: IdOf,
  cx: number,
  cy: number,
  r: number,
  glow: string
): Array<CastNode> => [
  el("circle", { cx, cy, r: r + 1.6, fill: "#55626f" }),
  el("circle", { cx, cy, r: r + 0.8, fill: "#c9d3dc" }),
  el("circle", { cx, cy, r, fill: url(id("lens")) }),
  el("circle", { cx, cy, r: r * 0.9, fill: url(id("led")) }),
  el("circle", {
    cx,
    cy,
    r: r * 0.45,
    fill: "none",
    stroke: glow,
    "stroke-width": 1.2,
  }),
  el("circle", { cx, cy, r: r * 0.16, fill: glow }),
  el("ellipse", {
    cx: cx - r * 0.38,
    cy: cy - r * 0.42,
    rx: r * 0.3,
    ry: r * 0.2,
    fill: "#ffffff",
    opacity: 0.85,
  }),
]

const rivets = (
  at: ReadonlyArray<readonly [number, number]>
): Array<CastNode> =>
  at.flatMap(([x, y]) => [
    el("circle", { cx: x, cy: y, r: 1.1, fill: "#7c8a98" }),
    el("circle", {
      cx: x - 0.35,
      cy: y - 0.35,
      r: 0.45,
      fill: "#ffffff",
      opacity: 0.8,
    }),
  ])

/** The tin body, pressed, then shaded from below. */
const tin = (id: IdOf, d: string): Array<CastNode> => [
  el("path", { d, fill: url(id("tin")) }),
  el("path", { d, fill: url(id("tin-shade")) }),
]

const OWLET =
  "M48 16C32 16 22 27 22 42C22 49 24 55 27 59C25 69 30 80 38 84L58 84C66 80 71 69 69 59C72 55 74 49 74 42C74 27 64 16 48 16Z"

/** A tin wing drawn along +x from its pivot, so a host aims it by rotating it. */
const WING =
  "M-1 -4.2C6 -6.4 16 -5.6 23 -1.1C24.4 0 24.4 0.7 23 1.5C16 5.4 6 6 -1 4.2Z"

/**
 * One tin wing, pivoted at (`x`, 60) behind the body and folded into it
 * (`rotate(fold)`), so the still drawing hides it; a host swings it out.
 */
const wing = (id: IdOf, part: string, x: number, fold: number): CastNode =>
  el("g", { transform: `translate(${String(x)} 60)` }, [
    el("g", { "data-part": part, transform: `rotate(${String(fold)})` }, [
      ...tin(id, WING),
      el("path", {
        d: WING,
        fill: "none",
        stroke: "#6f7d8b",
        "stroke-width": 0.8,
      }),
      el("path", {
        d: "M7 -1.5H19M7 1.7H17",
        stroke: "#7c8a98",
        "stroke-width": 0.8,
        "stroke-linecap": "round",
      }),
    ]),
  ])

/**
 * Where the tin owlet's moving parts sit, for a host that moves them
 * (`./host-tin-owlet`): each lens's center on the eye line, each tuft's
 * root, and how far an upper lid travels from parked to shut.
 */
export const TIN_OWLET_RIG = {
  lens: { left: 38.5, right: 57.5 },
  eyeLine: 41,
  tuftRoot: { left: { x: 36, y: 25 }, right: { x: 60, y: 25 } },
  lidTravel: 14.8,
} as const

/**
 * A tin shutter over one lens, clipped to its rim: the upper lid parked
 * above the glass and the lower one below it, so neither shows until a host
 * draws one over the eye.
 */
const lids = (id: IdOf, side: "left" | "right"): CastNode => {
  const cx = TIN_OWLET_RIG.lens[side]
  const cy = TIN_OWLET_RIG.eyeLine
  const top = cy - 7.4 - TIN_OWLET_RIG.lidTravel
  const left = String(cx - 11)
  const right = String(cx + 11)
  return el("g", {}, [
    el("defs", {}, [
      el("clipPath", { id: id(`lid-${side}-clip`) }, [
        el("circle", { cx, cy, r: 7.25 }),
      ]),
    ]),
    el("g", { "clip-path": url(id(`lid-${side}-clip`)) }, [
      el("g", { "data-part": `lid-${side}` }, [
        ...tin(id, `M${left} ${String(top)}H${right}V33.6H${left}Z`),
        el("path", {
          d: `M${left} 33.2H${right}`,
          stroke: "#55626f",
          "stroke-width": 1.1,
        }),
      ]),
      el("g", { "data-part": `low-lid-${side}` }, [
        el("ellipse", { cx, cy: 58.4, rx: 12, ry: 9, fill: url(id("tin")) }),
        el("ellipse", {
          cx,
          cy: 58.4,
          rx: 12,
          ry: 9,
          fill: "none",
          stroke: "#55626f",
          "stroke-width": 1.1,
        }),
      ]),
    ]),
  ])
}

/** An ear tuft, from its tip to its root, where a host turns it. */
const tuft = (part: string, side: "left" | "right", tipX: number): CastNode => {
  const root = TIN_OWLET_RIG.tuftRoot[side]
  return el("g", { "data-part": part }, [
    el("path", {
      d: `M${String(tipX)} 18L${String(root.x)} ${String(root.y)}`,
      stroke: "#8b99a7",
      "stroke-width": 3,
      "stroke-linecap": "round",
    }),
  ])
}

/** The tutor: a wind-up tin owlet, its key at its side, its moving parts tucked out of sight. */
const tinOwlet = (id: IdOf): Array<CastNode> => [
  tinDefs(id, TEAL),
  ...stage(id, { cy: 86, rx: 28 }),
  el("g", { "data-part": "figure" }, [
    wing(id, "wing-left", 31, 0),
    wing(id, "wing-right", 65, 180),
    el("path", {
      d: "M73 46H80M80 41V51",
      stroke: url(id("brass")),
      "stroke-width": 3,
      "stroke-linecap": "round",
      "data-part": "key",
    }),
    tuft("tuft-left", "left", 30),
    tuft("tuft-right", "right", 66),
    ...tin(id, OWLET),
    el("path", {
      d: "M24 56Q48 64 72 56",
      fill: "none",
      stroke: "#6f7d8b",
      "stroke-width": 0.9,
    }),
    ...rivets([
      [30, 59],
      [40, 61.6],
      [56, 61.6],
      [66, 59],
      [48, 62.4],
    ]),
    el("path", {
      d: "M38 70Q48 75 58 70M40 76Q48 80 56 76",
      fill: "none",
      stroke: "#7c8a98",
      "stroke-width": 0.9,
      opacity: 0.8,
    }),
    el("g", { "data-part": "eyes" }, [
      ...lens(id, TIN_OWLET_RIG.lens.left, TIN_OWLET_RIG.eyeLine, 6.4, TEAL),
      ...lens(id, TIN_OWLET_RIG.lens.right, TIN_OWLET_RIG.eyeLine, 6.4, TEAL),
      lids(id, "left"),
      lids(id, "right"),
    ]),
    el("ellipse", {
      cx: 48,
      cy: 52.4,
      rx: 1.4,
      ry: 1.1,
      fill: "#1a1410",
      "data-part": "mouth",
    }),
    el("path", {
      d: "M45.8 51.2L50.2 51.2L48 55.2Z",
      fill: "#a9853f",
      "data-part": "beak-low",
    }),
    el("path", { d: "M44.5 50L51.5 50L48 56Z", fill: url(id("brass")) }),
    el("path", {
      d: "M45.5 50.6H50.5",
      stroke: "#ffffff",
      "stroke-width": 0.6,
      opacity: 0.7,
    }),
    el("ellipse", {
      cx: 36,
      cy: 24,
      rx: 6.5,
      ry: 2.4,
      transform: "rotate(-25 36 24)",
      fill: "#ffffff",
      opacity: 0.8,
    }),
    ...rim(id, OWLET, "#d6f9ff", 3.2),
  ]),
]

const SPARROW =
  "M48 24C34 24 25 34 25 47C25 55 28 61 32 65C33 74 38 82 44 84L54 84C61 82 65 75 66 67C70 62 72 55 72 48C72 34 62 24 48 24Z"

/** The one asking: a tin sparrow, head tilted, its antenna a question mark. */
const tinSparrow = (id: IdOf): Array<CastNode> => [
  tinDefs(id, LILAC),
  ...stage(id, { cy: 86, rx: 26 }),
  el("g", { transform: "rotate(-8 48 54)" }, [
    el("path", {
      d: "M48 25C47 18 49 12 54 9C59 6 65 8 66 13C67 17 64 20 60.5 21",
      fill: "none",
      stroke: "#7d8b99",
      "stroke-width": 2.4,
      "stroke-linecap": "round",
    }),
    el("circle", { cx: 60, cy: 21.5, r: 5, fill: url(id("led")) }),
    el("circle", { cx: 60, cy: 21.5, r: 2.4, fill: LILAC }),
    ...tin(id, SPARROW),
    el("path", {
      d: "M27 58Q48 66 70 57",
      fill: "none",
      stroke: "#6f7d8b",
      "stroke-width": 0.9,
    }),
    ...rivets([
      [33, 61],
      [48, 64],
      [63, 60.5],
    ]),
    ...lens(id, 39, 45, 5.4, LILAC),
    ...lens(id, 57, 44, 6.4, LILAC),
    el("path", { d: "M45 52.5L52 52.5L48.5 58Z", fill: url(id("brass")) }),
    el("ellipse", {
      cx: 37,
      cy: 31,
      rx: 6,
      ry: 2.2,
      transform: "rotate(-28 37 31)",
      fill: "#ffffff",
      opacity: 0.8,
    }),
    ...rim(id, SPARROW, "#efe6ff", 3.2),
  ]),
]

const DRAW: Readonly<Record<Character, (id: IdOf) => Array<CastNode>>> = {
  mochi,
  "tin-owlet": tinOwlet,
  "tin-sparrow": tinSparrow,
}

/** Character `who`, as the children of a `<svg viewBox="0 0 96 96">`. */
export const castNodes = (who: Character, id: IdOf): ReadonlyArray<CastNode> =>
  DRAW[who](id)

/** The box every character is drawn in. */
export const CAST_VIEW_BOX = "0 0 96 96"

/** `value` safe inside SVG or HTML text and a quoted attribute. */
export const escapeText = (value: string | number): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/**
 * Character `who` as one standalone `<svg>` at `size`, its ground clear and
 * its key light left out: how a drawing made outside React shows a
 * character on its own ground (the thumbnails' "+ me", the public site's
 * photo slot). Its gradients are named for `who`, so one per page.
 */
export const characterSvg = (who: Character, size: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAST_VIEW_BOX}" width="${String(size)}" height="${String(size)}">${nodesText(
    castNodes(who, (name) => `${who}-${name}`),
    { ground: "none", glow: false }
  )}</svg>`

/** How `nodesText` draws: the backdrop's paint, and whether the key light shows. */
type TextOptions = { readonly ground: string; readonly glow?: boolean }

/**
 * `nodes` as SVG text, for a drawing made outside React (a thumbnail,
 * `@some-ui/video-render`'s `thumbnail`). `ground` paints the backdrop's
 * rect (`data-ground`), which a page leaves to its theme; `glow: false`
 * leaves out the stage's square key light (`data-glow`), which reads as a
 * box on a ground other than a bubble's.
 */
export const nodesText = (
  nodes: ReadonlyArray<CastNode>,
  { ground, glow = true }: TextOptions
): string =>
  nodes
    .filter((node) => glow || node.attrs["data-glow"] === undefined)
    .map((node) => {
      const attrs = Object.entries(node.attrs).filter(
        ([name]) => name !== "data-ground" && name !== "data-glow"
      )
      const painted =
        node.attrs["data-ground"] === undefined
          ? attrs
          : [...attrs, ["fill", ground] as const]
      const children = nodesText(node.children ?? [], { ground, glow })
      return `<${node.tag}${painted.map(([name, value]) => ` ${name}="${escapeText(value)}"`).join("")}>${children}</${node.tag}>`
    })
    .join("")
