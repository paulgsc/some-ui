/**
 * The mochi's loops (HOST4, #3525): the owner's character, its emotions and
 * its NFL celebration, as `./host` draws them over its idle.
 *
 * A soft, round character carries emotion in its squash and stretch and its
 * face, so every emotion is one `Pose` (how the figure sits, what the face
 * does, which sign shows) as a pure function of the seconds since its beat
 * began, and one drawing (`posed`) moves `./cast`'s named parts to it. A
 * new emotion is a new key of `MOCHI_EMOTIONS`, which `EmotionOf<"mochi">`
 * asks for.
 */

import { INK, type CastNode } from "./cast"
import type { CeremonyOf, EmotionOf } from "./host"
import {
  clamp,
  lerp,
  moved,
  num,
  retouched,
  smooth,
  TAU,
  type Redraw,
} from "./host-draw"

/** What a loop sets on one part: its attributes, and a `transform` moving it further. */
type Touch = Readonly<Record<string, string | number>>

/**
 * `nodes` with each part given its touch: its `transform` applied outside
 * the part's own (or, `how` "replace", in its place), the rest replacing
 * the part's attributes.
 */
function touched(
  nodes: ReadonlyArray<CastNode>,
  touches: ReadonlyArray<readonly [string, Touch]>,
  how: "further" | "replace" = "further"
): ReadonlyArray<CastNode> {
  let out = nodes
  for (const [part, { transform, ...attrs }] of touches) {
    const move = transform === undefined ? undefined : String(transform)
    out =
      how === "replace" && move !== undefined
        ? retouched(moved(out, part, move), part, attrs)
        : retouched(out, part, attrs, move)
  }
  return out
}

/** The whole figure squashed or stretched from its feet, leaning and moved. */
const figureAt = (f: {
  readonly stretch: number
  readonly tilt: number
  readonly dx: number
  readonly dy: number
}): Touch => ({
  transform: `translate(${num(f.dx)} ${num(f.dy)}) rotate(${num(f.tilt)} 48 84) translate(48 84) scale(${num(1 + (1 - f.stretch) * 0.85)} ${num(f.stretch)}) translate(-48 -84)`,
})

/** The mouth's shape: a crescent from corner to corner, or a stroked wave. */
type Mouth =
  | {
      readonly kind: "crescent"
      /** Half its width. */
      readonly w: number
      /** How far the corners sit below the line (negative lifts them: a smile). */
      readonly corner: number
      /** The lower edge's pull below the line, and the upper edge's. */
      readonly low: number
      readonly up: number
    }
  | { readonly kind: "wave"; readonly w: number; readonly amp: number }

/** A brow: its turn in degrees (positive drops the inner end), and its lift. */
type Brow = { readonly turn: number; readonly lift: number }

/** The signs over and beside the head, each shown `0` (clear) to `1`. */
const SIGNS = [
  "question",
  "bang",
  "bulb",
  "swirl",
  "sweat",
  "vein",
  "puff",
  "dots",
  "sparks",
] as const

type Sign = (typeof SIGNS)[number]

/** The parts a sign shows. */
const partsOf = (sign: Sign): ReadonlyArray<string> =>
  sign === "dots"
    ? ["dot-1", "dot-2", "dot-3"]
    : sign === "sparks"
      ? ["spark-1", "spark-2", "spark-3"]
      : [sign]

/** How the mochi sits and what its face does at one moment. */
type Pose = {
  /** Height over its rest (1), the width giving way to keep its volume. */
  readonly stretch: number
  /** Its lean, in degrees, about its feet. */
  readonly tilt: number
  readonly dx: number
  /** Up is negative. */
  readonly dy: number
  /** The face's drift within the body. */
  readonly faceX: number
  readonly faceY: number
  /** The eyes' size, each axis, and where they look within the face. */
  readonly eyeW: number
  readonly eyeH: number
  readonly eyeX: number
  readonly eyeY: number
  /** Eyes shut in a smile (`^ ^`) rather than open. */
  readonly happyEyes: boolean
  /** Brows show when set: the left, the right. */
  readonly brows?: readonly [Brow, Brow]
  readonly mouth?: Mouth
  /** The cheeks' blush, 0.7 at rest to 1, and their size. */
  readonly blush: number
  readonly cheekSize: number
  /** Each antenna's turn in degrees, positive standing it up. */
  readonly antennaLeft: number
  readonly antennaRight: number
  /** Each sign's strength at this moment and its own motion, a phase 0 to 1. */
  readonly signs: Partial<Readonly<Record<Sign, number>>>
  readonly phase: number
}

const REST: Pose = {
  stretch: 1,
  tilt: 0,
  dx: 0,
  dy: 0,
  faceX: 0,
  faceY: 0,
  eyeW: 1,
  eyeH: 1,
  eyeX: 0,
  eyeY: 0,
  happyEyes: false,
  blush: 0.7,
  cheekSize: 1,
  antennaLeft: 0,
  antennaRight: 0,
  signs: {},
  phase: 0,
}

const wave = (s: number, period: number, offset = 0): number =>
  Math.sin(TAU * (s / period + offset))

/** A sign's arrival: 0 to 1 over `dur` s from `at`, overshooting a little as it lands. */
const pop = (s: number, at: number, dur: number): number => {
  const p = clamp((s - at) / dur, 0, 1) - 1
  return 1 + 2.4 * p * p * p + 1.4 * p * p
}

/** An emotion arriving over the time a beat takes to arrive (`BEAT_BLEND_MS`, `./host`). */
const arrive = (s: number): number => smooth(s / 0.38)

/** How a crescent mouth sits as SVG path data, about the rest mouth's line. */
function mouthD(m: Mouth): string {
  const y = 62.2
  if (m.kind === "wave") {
    const x0 = 48 - m.w
    const step = (2 * m.w) / 4
    const pts = [0, 1, 2, 3].map(
      (i) =>
        `Q${num(x0 + step * (i + 0.5))} ${num(y + (i % 2 === 0 ? -m.amp : m.amp))} ${num(x0 + step * (i + 1))} ${num(y)}`
    )
    return `M${num(x0)} ${num(y)}${pts.join("")}`
  }
  const c = y + m.corner
  return `M${num(48 - m.w)} ${num(c)}Q48 ${num(y + m.low)} ${num(48 + m.w)} ${num(c)}Q48 ${num(y + m.up)} ${num(48 - m.w)} ${num(c)}Z`
}

const SMILE: Mouth = { kind: "crescent", w: 4.4, corner: 0, low: 6.4, up: 2.2 }
const GRIN: Mouth = {
  kind: "crescent",
  w: 5.8,
  corner: -0.8,
  low: 9.6,
  up: 1.4,
}
const OH: Mouth = { kind: "crescent", w: 2, corner: 0, low: 3.8, up: -2.6 }
const FLAT: Mouth = { kind: "crescent", w: 3.8, corner: 0, low: 1.1, up: -0.7 }
const FROWN: Mouth = {
  kind: "crescent",
  w: 4.4,
  corner: 2.4,
  low: 0.8,
  up: -1.4,
}
const GRIT: Mouth = { kind: "crescent", w: 5.2, corner: 1.6, low: 3, up: -0.8 }

const brows = (left: Brow, right: Brow = left): readonly [Brow, Brow] => [
  left,
  right,
]

/** How much larger than drawn a sign shows, so it reads in a long shot. */
const SIGN_SCALE = 1.4

/** Where each sign sits, over the head's right shoulder unless it is the head's own. */
const SIGN_AT: Readonly<
  Record<Exclude<Sign, "sparks">, { x: number; y: number }>
> = {
  question: { x: 82, y: 24 },
  bang: { x: 83, y: 25 },
  bulb: { x: 74, y: 27 },
  swirl: { x: 81, y: 18 },
  sweat: { x: 72, y: 33 },
  vein: { x: 71, y: 35 },
  puff: { x: 30, y: 68 },
  dots: { x: 80, y: 22 },
}

/** The glints' places, and the beat each twinkles on. */
const SPARKS = [
  { x: 14, y: 30, off: 0 },
  { x: 84, y: 44, off: 0.33 },
  { x: 20, y: 70, off: 0.66 },
] as const

function posed(
  nodes: ReadonlyArray<CastNode>,
  p: Pose
): ReadonlyArray<CastNode> {
  const touches: Array<readonly [string, Touch]> = [["figure", figureAt(p)]]
  touches.push([
    "face",
    { transform: `translate(${num(p.faceX)} ${num(p.faceY)})` },
  ])
  touches.push([
    "eyes",
    {
      transform: `translate(${num(p.eyeX)} ${num(p.eyeY)}) translate(48 55) scale(${num(p.eyeW)} ${num(p.eyeH)}) translate(-48 -55)`,
      opacity: p.happyEyes ? 0 : 1,
    },
  ])
  if (p.happyEyes) touches.push(["eyes-happy", { opacity: 1 }])
  touches.push([
    "cheeks",
    {
      transform: `translate(48 62) scale(${num(p.cheekSize)}) translate(-48 -62)`,
      opacity: num(clamp(p.blush, 0, 1)),
    },
  ])
  if (p.brows !== undefined) {
    const [left, right] = p.brows
    touches.push([
      "brow-left",
      {
        opacity: 1,
        transform: `translate(${num(p.eyeX * 0.4)} ${num(-left.lift)}) rotate(${num(left.turn)} 39.5 48)`,
      },
    ])
    touches.push([
      "brow-right",
      {
        opacity: 1,
        transform: `translate(${num(p.eyeX * 0.4)} ${num(-right.lift)}) rotate(${num(-right.turn)} 56.5 48)`,
      },
    ])
  }
  if (p.mouth !== undefined) {
    touches.push([
      "mouth",
      p.mouth.kind === "wave"
        ? {
            d: mouthD(p.mouth),
            fill: "none",
            stroke: INK,
            "stroke-width": 1.5,
            "stroke-linecap": "round",
          }
        : { d: mouthD(p.mouth) },
    ])
  }
  touches.push([
    "antenna-left",
    { transform: `rotate(${num(p.antennaLeft)} 40 27)` },
  ])
  touches.push([
    "antenna-right",
    { transform: `rotate(${num(-p.antennaRight)} 56 27)` },
  ])
  for (const sign of SIGNS) {
    const strength = p.signs[sign]
    if (strength !== undefined)
      touches.push(...signTouches(sign, clamp(strength, 0, 1.2), p.phase))
  }
  return touched(nodes, touches)
}

/** A sign at `strength` (its size, overshoot included) in its own motion at `phase`. */
function signTouches(
  sign: Sign,
  strength: number,
  phase: number
): ReadonlyArray<readonly [string, Touch]> {
  const shown = num(clamp(strength, 0, 1))
  if (sign === "sparks") {
    return SPARKS.map(({ x, y, off }, i) => {
      const tw = Math.max(0, Math.sin(TAU * (phase + off)))
      return [
        `spark-${String(i + 1)}`,
        {
          opacity: num(clamp(strength, 0, 1) * tw),
          transform: `translate(${String(x)} ${String(y)}) rotate(${num(90 * phase)}) scale(${num(0.6 + 0.7 * tw)})`,
        },
      ]
    })
  }
  const at = SIGN_AT[sign]
  const place = (dx: number, dy: number, scale: number, turn = 0): string =>
    `translate(${num(at.x + dx)} ${num(at.y + dy)}) rotate(${num(turn)}) scale(${num(SIGN_SCALE * scale)})`
  switch (sign) {
    case "question":
    case "bang": {
      return [
        [
          sign,
          {
            opacity: shown,
            transform: place(
              0,
              -1.6 * Math.sin(TAU * phase),
              strength,
              8 * Math.sin(TAU * phase * 0.5)
            ),
          },
        ],
      ]
    }
    case "bulb": {
      return [
        [
          sign,
          {
            opacity: shown,
            transform: place(
              0,
              -1.2 * Math.sin(TAU * phase),
              strength * (1 + 0.05 * Math.sin(TAU * phase * 2))
            ),
          },
        ],
      ]
    }
    case "swirl": {
      return [
        [
          sign,
          { opacity: shown, transform: place(0, 0, strength, 360 * phase) },
        ],
      ]
    }
    case "sweat": {
      return [
        [
          sign,
          {
            opacity: num(
              clamp(strength, 0, 1) * (phase < 0.8 ? 1 : (1 - phase) / 0.2)
            ),
            transform: place(0, 9 * phase, 1),
          },
        ],
      ]
    }
    case "vein": {
      return [
        [
          sign,
          {
            opacity: shown,
            transform: place(
              0,
              0,
              strength * (0.9 + 0.3 * Math.abs(Math.sin(TAU * phase)))
            ),
          },
        ],
      ]
    }
    case "puff": {
      return [
        [
          sign,
          {
            opacity: num(clamp(strength, 0, 1) * Math.sin(Math.PI * phase)),
            transform: place(-8 * phase, -3 * phase, 0.8 + 0.7 * phase),
          },
        ],
      ]
    }
    case "dots": {
      return [1, 2, 3].map((n) => [
        `dot-${String(n)}`,
        {
          opacity: num(
            clamp(strength, 0, 1) * smooth((phase - (n - 1) * 0.22) / 0.12)
          ),
          transform: place(
            (n - 2) * 7,
            -1.2 * Math.sin(TAU * (phase + n * 0.15)),
            1
          ),
        },
      ])
    }
    default: {
      const never: never = sign
      throw new Error(`no such sign: ${String(never)}`)
    }
  }
}

/** A pose: rest, then `over`, its every number eased in from rest over `e`. */
function toward(over: Partial<Pose>, e: number): Pose {
  const mix = (a: number, b: number | undefined): number =>
    b === undefined ? a : lerp(a, b, e)
  const brow = (b: Brow): Brow => ({ turn: b.turn * e, lift: b.lift * e })
  return {
    ...REST,
    ...over,
    stretch: mix(REST.stretch, over.stretch),
    tilt: mix(0, over.tilt),
    dx: mix(0, over.dx),
    dy: mix(0, over.dy),
    faceX: mix(0, over.faceX),
    faceY: mix(0, over.faceY),
    eyeW: mix(1, over.eyeW),
    eyeH: mix(1, over.eyeH),
    eyeX: mix(0, over.eyeX),
    eyeY: mix(0, over.eyeY),
    blush: mix(REST.blush, over.blush),
    cheekSize: mix(1, over.cheekSize),
    antennaLeft: mix(0, over.antennaLeft),
    antennaRight: mix(0, over.antennaRight),
    ...(over.brows === undefined
      ? {}
      : { brows: brows(brow(over.brows[0]), brow(over.brows[1])) }),
    signs: Object.fromEntries(
      Object.entries(over.signs ?? {}).map(([k, v]) => [k, v * e])
    ),
  }
}

/** An emotion drawn: its pose `s` seconds into its beat, eased in over the beat's arrival. */
const posedBy =
  (at: (s: number) => Partial<Pose>): Redraw =>
  (nodes, tMs) => {
    const s = Math.max(0, tMs) / 1000
    return posed(nodes, toward(at(s), arrive(s)))
  }

export const MOCHI_EMOTIONS: Readonly<Record<EmotionOf<"mochi">, Redraw>> = {
  neutral: posedBy((s) => ({
    antennaLeft: 3 * wave(s, 4.1),
    antennaRight: 3 * wave(s, 4.7, 0.3),
  })),
  // Leaning in: taller, eyes wide, brows up, antennas twitching forward.
  curious: posedBy((s) => ({
    stretch: 1.04,
    tilt: 6 + 2 * wave(s, 2.6),
    eyeW: 1.14,
    eyeH: 1.16,
    brows: brows({ turn: -6, lift: 2 }),
    mouth: OH,
    antennaLeft: 12 + 5 * Math.max(0, wave(s, 1.3)),
    antennaRight: 12 + 5 * Math.max(0, wave(s, 1.3, 0.4)),
  })),
  // Wooden: half-lidded, a flat mouth, low brows, antennas drooping, still.
  taciturn: posedBy(() => ({
    stretch: 0.98,
    eyeH: 0.42,
    eyeY: 0.6,
    brows: brows({ turn: 0, lift: -1.4 }),
    mouth: FLAT,
    blush: 0.35,
    antennaLeft: -8,
    antennaRight: -8,
  })),
  // Hopping: squash at the floor, stretch in the air, eyes shut in a smile.
  happy: posedBy((s) => {
    const h = Math.abs(Math.sin((Math.PI * s) / 0.9))
    return {
      stretch: 0.93 + 0.12 * h,
      dy: -4 * h,
      happyEyes: true,
      mouth: GRIN,
      blush: 1,
      cheekSize: 1.2,
      antennaLeft: 10 * wave(s, 0.9, 0.15),
      antennaRight: 10 * wave(s, 0.9, 0.3),
      signs: { sparks: 1 },
      phase: (s / 1.8) % 1,
    }
  }),
  // Head tilted, one brow up and one down, a crooked mouth.
  perplexed: posedBy((s) => ({
    tilt: -11 + 1.5 * wave(s, 2.2),
    faceX: -1,
    brows: brows({ turn: -14, lift: 3 }, { turn: 10, lift: -0.6 }),
    eyeW: 1.05,
    mouth: { kind: "wave", w: 3.6, amp: 1.1 },
    antennaLeft: 14,
    antennaRight: -10,
  })),
  // Trembling: worried brows, wide darting eyes, a wavy mouth, a sliding drop.
  anxious: posedBy((s) => ({
    stretch: 0.96,
    dx: 0.55 * Math.sin(TAU * 13 * s),
    brows: brows({ turn: -16, lift: 1.6 }),
    eyeW: 0.9,
    eyeH: 1.12,
    eyeX: 1.6 * Math.sign(wave(s, 1.4)),
    mouth: { kind: "wave", w: 4, amp: 0.9 },
    antennaLeft: -10 + 2.5 * Math.sin(TAU * 9 * s),
    antennaRight: -10 + 2.5 * Math.sin(TAU * 9 * s + 1),
    signs: { sweat: 1 },
    phase: (s / 1.6) % 1,
  })),
  // Slumped, a huff every couple of seconds: it rises, sinks, and sighs out.
  frustrated: posedBy((s) => {
    const u = (s / 2.2) % 1
    const huff = u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.5)
    return {
      stretch: 0.92 + 0.07 * huff,
      faceY: 1,
      brows: brows({ turn: 12, lift: -0.6 }),
      eyeH: 0.62,
      eyeY: 0.6,
      mouth: FROWN,
      antennaLeft: -14 + 6 * huff,
      antennaRight: -14 + 6 * huff,
      signs: { puff: u > 0.3 ? 1 : 0 },
      phase: clamp((u - 0.3) / 0.6, 0, 1),
    }
  }),
  // Tall and shaking, brows hard down, a gritted mouth, flushed, a vein throbbing.
  angry: posedBy((s) => ({
    stretch: 1.06,
    dx: 0.8 * Math.sin(TAU * 9 * s),
    brows: brows({ turn: 24, lift: -1.2 }),
    eyeH: 0.72,
    mouth: GRIT,
    blush: 1,
    cheekSize: 1.3,
    antennaLeft: 14 + 1.5 * Math.sin(TAU * 11 * s),
    antennaRight: 14 + 1.5 * Math.sin(TAU * 11 * s + 0.7),
    signs: { vein: 1 },
    phase: (s / 0.62) % 1,
  })),
  // A slow, proud bow: upright with its eyes shut, then down, then up again.
  ceremonious: posedBy((s) => {
    const u = (s / 3.2) % 1
    const bow =
      u < 0.25
        ? 0
        : u < 0.5
          ? smooth((u - 0.25) / 0.25)
          : u < 0.75
            ? 1 - smooth((u - 0.5) / 0.25)
            : 0
    return {
      stretch: 1.03 - 0.11 * bow,
      faceY: -1 + 4 * bow,
      happyEyes: true,
      mouth: SMILE,
      blush: 0.95,
      antennaLeft: 6 - 22 * bow,
      antennaRight: 6 - 22 * bow,
      signs: { sparks: 0.9 },
      phase: (s / 2.4) % 1,
    }
  }),
  // Asking: a question mark pops in and bobs, head tilting, brows up, mouth round.
  question: posedBy((s) => ({
    tilt:
      8 *
      Math.sign(wave(s, 2.4, 0.25)) *
      smooth(Math.abs(wave(s, 2.4, 0.25)) * 3),
    brows: brows({ turn: -8, lift: 2.4 }),
    eyeW: 1.08,
    eyeH: 1.08,
    mouth: OH,
    antennaLeft: 12,
    antennaRight: 12,
    signs: { question: pop(s, 0.05, 0.42) },
    phase: (s / 1.6) % 1,
  })),
  // Lost: a swirl spinning, the head wobbling, eyes wandering, brows see-sawing.
  confusion: posedBy((s) => ({
    tilt: 7 * wave(s, 1.8),
    eyeW: 0.9,
    eyeH: 0.9,
    eyeX: 1.5 * wave(s, 1.1),
    brows: brows(
      { turn: -10 * wave(s, 1.8), lift: 1.4 },
      { turn: 10 * wave(s, 1.8), lift: 1.4 }
    ),
    mouth: { kind: "wave", w: 3.4, amp: 1 },
    antennaLeft: 10 * wave(s, 1.5),
    antennaRight: -10 * wave(s, 1.5, 0.2),
    signs: { swirl: pop(s, 0, 0.4) },
    phase: (s / 1.4) % 1,
  })),
  // Raising one: a bang pops, it starts back and stiffens, brows knit.
  issue: posedBy((s) => {
    const start = s < 0.5 ? Math.sin((Math.PI * s) / 0.5) : 0
    return {
      stretch: 1.04 + 0.02 * start,
      dy: -1.5 * start,
      brows: brows({ turn: 9, lift: 0.4 }),
      eyeW: 1.1,
      eyeH: 1.1,
      mouth: FLAT,
      antennaLeft: 11 + 4 * Math.max(0, wave(s, 2.1)),
      antennaRight: 11 + 4 * Math.max(0, wave(s, 2.1, 0.5)),
      signs: { bang: pop(s, 0.05, 0.36) },
      phase: (s / 1.2) % 1,
    }
  }),
  // Aha: a bulb lights over it, it springs up, eyes wide, a small smile.
  intuition: posedBy((s) => {
    const spring = s < 0.6 ? Math.sin((Math.PI * s) / 0.6) : 0
    return {
      stretch: 1.03 + 0.03 * spring,
      dy: -1.2 * spring,
      brows: brows({ turn: -6, lift: 2.6 }),
      eyeW: 1.16,
      eyeH: 1.18,
      mouth: SMILE,
      blush: 0.9,
      antennaLeft: 14,
      antennaRight: 14,
      signs: { bulb: pop(s, 0, 0.45) },
      phase: (s / 1.8) % 1,
    }
  }),
  // Holding back: three dots fill in, eyes slide aside, one brow up, a sway.
  hesitation: posedBy((s) => ({
    stretch: 0.98,
    tilt: -3 + 2 * wave(s, 2.4),
    eyeX: -1.8,
    eyeY: 0.8,
    brows: brows({ turn: 0, lift: 0 }, { turn: -10, lift: 2 }),
    mouth: { kind: "wave", w: 3, amp: 0.6 },
    antennaLeft: 0,
    antennaRight: -9,
    signs: { dots: 1 },
    phase: (s / 1.8) % 1,
  })),
}

// ---- The NFL celebration ----

/** One celebration's length, seconds. */
export const CELEBRATION_S = 3.6

/** The arms' turns about the shoulders, degrees: down at the sides, and up for a touchdown. */
const ARMS_DOWN = { left: -55, right: 55 }
const ARMS_UP = { left: 40, right: -40 }
const SHOULDER = { left: { x: 24, y: 60 }, right: { x: 72, y: 60 } }

/** How much of the dance is left near the loop's end: it settles back to where the loop starts, so the loop is seamless. */
const settleAt = (u: number): number => 1 - smooth((u - 3.15) / 0.45)

/** Where the right hand is with the arm turned `deg`. */
const handAt = (deg: number): { x: number; y: number } => ({
  x: SHOULDER.right.x + 13 * Math.cos((deg * Math.PI) / 180),
  y: SHOULDER.right.y + 13 * Math.sin((deg * Math.PI) / 180),
})

/** The celebration at `u` s into its loop: the figure, the arms, the ball. */
function celebrationAt(u: number): {
  readonly stretch: number
  readonly dy: number
  readonly dx: number
  readonly tilt: number
  readonly left: number
  readonly right: number
  readonly ball: {
    x: number
    y: number
    turn: number
    squash: number
    shown: number
  }
  readonly dancing: number
} {
  const dance = Math.max(0, u - 1.35)
  const beat = Math.sin(TAU * 1.6 * dance)
  if (u < 0.3) {
    const e = smooth(u / 0.3)
    const hand = handAt(ARMS_DOWN.right)
    return {
      stretch: 1 - 0.14 * e,
      dy: 0,
      dx: 0,
      tilt: 0,
      left: ARMS_DOWN.left,
      right: ARMS_DOWN.right,
      ball: { ...hand, turn: 30, squash: 1, shown: smooth(u / 0.15) },
      dancing: 0,
    }
  }
  if (u < 0.9) {
    const p = (u - 0.3) / 0.6
    const e = smooth(p / 0.35)
    const right = lerp(ARMS_DOWN.right, ARMS_UP.right, e)
    return {
      stretch: 1.04 - 0.04 * p,
      dy: -4 * Math.sin(Math.PI * p),
      dx: 0,
      tilt: 0,
      left: lerp(ARMS_DOWN.left, ARMS_UP.left, e),
      right,
      ball: { ...handAt(right), turn: lerp(30, -60, e), squash: 1, shown: 1 },
      dancing: 0,
    }
  }
  if (u < 1.15) {
    const p = (u - 0.9) / 0.25
    return {
      stretch: 0.88 + 0.12 * smooth(p),
      dy: 0,
      dx: 0,
      tilt: 0,
      left: ARMS_UP.left,
      right: ARMS_UP.right,
      ball: { ...handAt(ARMS_UP.right), turn: -60, squash: 1, shown: 1 },
      dancing: 0,
    }
  }
  const spike = smooth((u - 1.15) / 0.2)
  const settle = settleAt(u)
  const amp = smooth(dance / 0.3) * settle
  const pump = 35 * beat * amp
  const right = lerp(
    ARMS_DOWN.right,
    lerp(ARMS_UP.right, 50, spike) - 55 * smooth(dance / 0.3) + pump,
    settle
  )
  const left = lerp(
    ARMS_DOWN.left,
    lerp(ARMS_UP.left, 5, smooth(dance / 0.3)) + pump,
    settle
  )
  const ground = { x: 76, y: 80.2 }
  let ball: {
    x: number
    y: number
    turn: number
    squash: number
    shown: number
  }
  if (u < 1.35) {
    const from = handAt(ARMS_UP.right)
    const e = (u - 1.15) / 0.2
    ball = {
      x: lerp(from.x, ground.x, e),
      y: lerp(from.y, ground.y, e * e),
      turn: lerp(-60, 0, e),
      squash: 1,
      shown: 1,
    }
  } else {
    const b = u - 1.35
    const hop = Math.abs(Math.sin(TAU * 1.4 * b)) * 10 * Math.exp(-2.2 * b)
    ball = {
      x: ground.x + 6 * smooth(b / 1.2),
      y: ground.y - hop,
      turn: 540 * b,
      squash: b < 0.06 ? 0.7 : 1,
      shown: b < 0.7 ? 1 : 1 - smooth((b - 0.7) / 0.35),
    }
  }
  return {
    stretch: 1 - 0.05 * Math.abs(beat) * settle,
    dy: 0,
    dx: 2.5 * Math.sin(TAU * 1.6 * dance + Math.PI / 2) * amp,
    tilt: 9 * beat * amp,
    left,
    right,
    ball,
    dancing: amp,
  }
}

/**
 * The NFL celebration (the owner, 2026-11-24): it crouches, leaps with
 * both arms up (the touchdown signal), lands, spikes the ball and dances
 * while the ball bounces off, then picks up another. Its face is joy over
 * whatever the emotion was, and its moves take the place of the emotion's.
 */
const nflCelebration: Redraw = (nodes, tMs) => {
  const u = (Math.max(0, tMs) / 1000) % CELEBRATION_S
  const c = celebrationAt(u)
  const wiggle = 16 * smooth(u / 0.3) * settleAt(u)
  const own: ReadonlyArray<readonly [string, Touch]> = [
    ["figure", figureAt(c)],
    [
      "antenna-left",
      { transform: `rotate(${num(wiggle * Math.sin(TAU * 1.6 * u))} 40 27)` },
    ],
    [
      "antenna-right",
      {
        transform: `rotate(${num(-wiggle * Math.sin(TAU * 1.6 * u + 0.6))} 56 27)`,
      },
    ],
    ...signTouches("sparks", c.dancing, (u / 1.2) % 1),
  ]
  // The arms come out as the celebration begins.
  const arms = num(smooth(tMs / 150))
  const touches: ReadonlyArray<readonly [string, Touch]> = [
    [
      "shadow",
      {
        transform: `translate(48 85) scale(${num(1 + c.dy * 0.04)} 1) translate(-48 -85)`,
      },
    ],
    [
      "arm-left",
      {
        opacity: arms,
        transform: `rotate(${num(c.left)} ${String(SHOULDER.left.x)} ${String(SHOULDER.left.y)})`,
      },
    ],
    [
      "arm-right",
      {
        opacity: arms,
        transform: `rotate(${num(c.right)} ${String(SHOULDER.right.x)} ${String(SHOULDER.right.y)})`,
      },
    ],
    [
      "football",
      {
        opacity: num(c.ball.shown),
        // In hand it moves with the figure; spiked, it keeps to the floor.
        transform: `${u < 1.15 ? `${String(figureAt(c).transform)} ` : ""}translate(${num(c.ball.x)} ${num(c.ball.y)}) rotate(${num(c.ball.turn)}) scale(1.15 ${num(1.15 * c.ball.squash)})`,
      },
    ],
    ["eyes", { opacity: 0 }],
    ["eyes-happy", { opacity: 1 }],
    ["brow-left", { opacity: 0 }],
    ["brow-right", { opacity: 0 }],
    ["mouth", { d: mouthD(GRIN), fill: INK, stroke: "none" }],
    ["cheeks", { opacity: 1 }],
    ...SIGNS.filter((sign) => sign !== "sparks")
      .flatMap(partsOf)
      .map((part) => [part, { opacity: 0 }] as const),
  ]
  // Its figure, antennas and glints are its own, wherever the emotion had them.
  return touched(touched(nodes, touches), own, "replace")
}

export const MOCHI_CEREMONIES: Readonly<Record<CeremonyOf<"mochi">, Redraw>> = {
  "nfl-celebration": nflCelebration,
}
