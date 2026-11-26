/**
 * Tin Bird's emotions, each a loop (HOST3, #3524): every emotion is a `Pose`
 * over time, the same vector for all of them, plus the effects that loop
 * draws beside the bird (a sweat drop, steam, sparks, a question mark).
 * Each is drawn to read at a long shot as well as a close-up: the
 * silhouette changes (wings out, the body hopping, tilting or bowing) and
 * an effect names the feeling, so neither depends on the eyes alone.
 */

import { el, TIN_OWLET_RIG, type CastNode } from "./cast"
import type { EmotionOf } from "./host"
import {
  changed,
  clamp,
  moved,
  num,
  smooth,
  TAU,
  type Moment,
  type Redraw,
} from "./host-draw"

/**
 * Where Tin Bird's parts are at a moment. A wing's angle is its elevation
 * in degrees above the outward horizontal: 90 up, -90 hanging, -180 folded
 * behind the body, as the still drawing has it.
 */
type Pose = {
  /** How far each upper lid is drawn over its lens, 0 (open) to 1 (shut). */
  readonly lidLeft: number
  readonly lidRight: number
  /** The lids' slant in degrees: above 0 the inner corners rise (worry), below 0 they fall (anger). */
  readonly slant: number
  /** How far the lower lids rise, 0 to 1: a smile pushes them up. */
  readonly lowLid: number
  /** The tufts in degrees: above 0 they droop outward, below 0 they prick up and in. */
  readonly tuftLeft: number
  readonly tuftRight: number
  /** How open the beak is, 0 to 1. */
  readonly beak: number
  readonly wingLeft: number
  readonly wingRight: number
  /** The whole figure: a shift, a tilt about its feet, and a stretch. */
  readonly x: number
  readonly y: number
  readonly tilt: number
  readonly stretch: number
  /** Where the eyes are drawn further, in the drawing's units. */
  readonly lookX: number
  readonly lookY: number
}

const FOLDED = -180

const REST: Pose = {
  lidLeft: 0,
  lidRight: 0,
  slant: 0,
  lowLid: 0,
  tuftLeft: 0,
  tuftRight: 0,
  beak: 0,
  wingLeft: FOLDED,
  wingRight: FOLDED,
  x: 0,
  y: 0,
  tilt: 0,
  stretch: 0,
  lookX: 0,
  lookY: 0,
}

/** An emotion's loop: its pose and the effects it draws, at `s` seconds. */
type Loop = (s: number) => {
  readonly pose: Pose
  readonly effects: ReadonlyArray<CastNode>
}

/** Where in a loop of `period` seconds `s` falls, 0 to 1. */
const phase = (s: number, period: number): number =>
  (((s / period) % 1) + 1) % 1

const wave = (s: number, period: number, shift = 0): number =>
  Math.sin(TAU * (s / period + shift))

/** 0 to 1 over the stretch of the loop from `from` to `to`, eased. */
const between = (p: number, from: number, to: number): number =>
  smooth((p - from) / (to - from))

// ---- The effects a loop draws beside the bird, in plain paint ----

const g = (
  transform: string,
  opacity: number,
  children: ReadonlyArray<CastNode>
): CastNode =>
  el("g", { transform, opacity: num(clamp(opacity, 0, 1)) }, children)

const path = (attrs: CastNode["attrs"]): CastNode => el("path", attrs)
const circle = (cx: number, cy: number, r: number, fill: string): CastNode =>
  el("circle", { cx, cy, r, fill })

/** A drop of sweat, sliding from the brow. */
const sweat = (x: number, y: number, opacity: number): CastNode =>
  g(`translate(${num(x)} ${num(y)}) scale(1.4)`, opacity, [
    path({
      d: "M0 -5C2.6 -1 3.6 1.2 3.6 2.6A3.6 3.6 0 0 1 -3.6 2.6C-3.6 1.2 -2.6 -1 0 -5Z",
      fill: "#9fdcff",
      stroke: "#e8f7ff",
      "stroke-width": 0.6,
    }),
    circle(-1.2, 1.6, 0.9, "#ffffff"),
  ])

/** A puff of steam. */
const puff = (x: number, y: number, size: number, opacity: number): CastNode =>
  g(`translate(${num(x)} ${num(y)}) scale(${num(size)})`, opacity, [
    circle(0, 0, 3.4, "#f4f7fa"),
    circle(-3, 1.4, 2.4, "#f4f7fa"),
    circle(3, 1.4, 2.4, "#f4f7fa"),
  ])

/** A four-pointed spark. */
const spark = (
  x: number,
  y: number,
  size: number,
  turn: number,
  opacity: number
): CastNode =>
  g(
    `translate(${num(x)} ${num(y)}) rotate(${num(turn)}) scale(${num(size)})`,
    opacity,
    [
      path({
        d: "M0 -6L1.4 -1.4L6 0L1.4 1.4L0 6L-1.4 1.4L-6 0L-1.4 -1.4Z",
        fill: "#fff1b0",
      }),
    ]
  )

/** A question mark, drawn as strokes so no font decides its shape. */
const question = (x: number, y: number, opacity: number): CastNode =>
  g(`translate(${num(x)} ${num(y)}) scale(1.35)`, opacity, [
    path({
      d: "M-3.4 -4.2C-3.4 -8.6 3.4 -8.6 3.4 -4.2C3.4 -1.2 0 -1.4 0 2",
      fill: "none",
      stroke: "#4ff0d8",
      "stroke-width": 2.4,
      "stroke-linecap": "round",
    }),
    circle(0, 6, 1.4, "#4ff0d8"),
  ])

/** The cross-vein of anger, a red mark at the brow. */
const vein = (x: number, y: number, size: number, opacity: number): CastNode =>
  g(`translate(${num(x)} ${num(y)}) scale(${num(size)})`, opacity, [
    path({
      d: "M-1.2 -5Q-1.2 -1.2 -5 -1.2M1.2 -5Q1.2 -1.2 5 -1.2M-1.2 5Q-1.2 1.2 -5 1.2M1.2 5Q1.2 1.2 5 1.2",
      fill: "none",
      stroke: "#ff5a4f",
      "stroke-width": 1.8,
      "stroke-linecap": "round",
    }),
  ])

/** One dot of a silence that says nothing. */
const dot = (x: number, y: number, opacity: number): CastNode =>
  g(`translate(${num(x)} ${num(y)})`, opacity, [circle(0, 0, 2.6, "#d7e0e8")])

// ---- The loops ----

const neutral: Loop = (s) => ({
  pose: { ...REST, lidLeft: 0.12, lidRight: 0.12, tilt: 1.4 * wave(s, 7.7) },
  effects: [],
})

/** Curious: the head tilts one way, then the other, tufts pricked, leaning in. */
const curious: Loop = (s) => {
  const side = clamp(1.8 * wave(s, 4), -1, 1)
  const twitch = Math.max(0, wave(s, 2, 0.1)) ** 8
  return {
    pose: {
      ...REST,
      tilt: 13 * side,
      x: 2 * side,
      tuftLeft: -20 - 12 * twitch,
      tuftRight: -20 - 12 * twitch,
      beak: 0.12,
      stretch: 0.04,
      y: -1,
      lookX: 0.8 * side,
      lookY: -1,
    },
    effects: [],
  }
}

/** Taciturn: heavy lids, the body still, and a silence spelled out in dots. */
const taciturn: Loop = (s) => {
  const p = phase(s, 5)
  const fade = 1 - between(p, 0.85, 0.97)
  return {
    pose: {
      ...REST,
      lidLeft: 0.55,
      lidRight: 0.55,
      slant: -3,
      tuftLeft: 12,
      tuftRight: 12,
      stretch: -0.02,
      lookX: -1.2,
    },
    effects: [0, 1, 2].map((i) =>
      dot(68 + 7 * i, 20, between(p, 0.15 + 0.18 * i, 0.22 + 0.18 * i) * fade)
    ),
  }
}

/** Happy: hopping, wings flapping, eyes smiling, sparks about. */
const happy: Loop = (s) => {
  const hop = Math.abs(Math.sin((TAU / 2) * (s / 0.9)))
  const flap = wave(s, 0.45)
  return {
    pose: {
      ...REST,
      lowLid: 0.62,
      tuftLeft: -16,
      tuftRight: -16,
      beak: 0.3,
      wingLeft: 25 + 22 * flap,
      wingRight: 25 + 22 * flap,
      y: -5 * hop,
      stretch: 0.05 * (hop - 0.5),
    },
    effects: [
      spark(14, 24, 1, 40 * s, Math.max(0, wave(s, 1.1))),
      spark(84, 30, 0.8, -50 * s, Math.max(0, wave(s, 1.1, 0.4))),
      spark(78, 12, 0.6, 30 * s, Math.max(0, wave(s, 1.1, 0.7))),
    ],
  }
}

/** Perplexed: head cocked, one lid squinting, a wing scratching, a question over it. */
const perplexed: Loop = (s) => ({
  pose: {
    ...REST,
    lidLeft: 0.42,
    lidRight: 0,
    slant: -6,
    tuftLeft: 16,
    tuftRight: -12,
    beak: 0.15,
    wingRight: 36 + 10 * wave(s, 0.34),
    tilt: -9 + 1.2 * wave(s, 2.6),
    lookX: -0.6,
    lookY: -1,
  },
  effects: [question(80, 14 + 1.5 * wave(s, 1.4), 1)],
})

/** Anxious: trembling, worried lids, wings fluttering low, eyes darting, a drop of sweat. */
const anxious: Loop = (s) => {
  const drip = phase(s, 1.4)
  const dart = clamp(3 * wave(s, 1.8), -1, 1)
  return {
    pose: {
      ...REST,
      lidLeft: 0.22,
      lidRight: 0.22,
      slant: 20,
      tuftLeft: 30,
      tuftRight: 30,
      beak: 0.14 * Math.max(0, Math.sign(wave(s, 0.15))),
      wingLeft: -72 + 7 * wave(s, 0.11),
      wingRight: -72 + 7 * wave(s, 0.11, 0.5),
      x: 0.5 * wave(s, 0.077) + 0.3 * wave(s, 0.058),
      tilt: 0.8 * wave(s, 0.091),
      stretch: -0.02,
      lookX: 1.3 * dart,
    },
    effects: [sweat(72, 24 + 16 * drip, drip < 0.85 ? 1 : (1 - drip) / 0.15)],
  }
}

/** Frustrated: wings flung up, then a slump and a sigh. */
const frustrated: Loop = (s) => {
  const p = phase(s, 2.6)
  const fling = between(p, 0.04, 0.2) * (1 - between(p, 0.42, 0.62))
  const slump = between(p, 0.45, 0.65) * (1 - between(p, 0.9, 1))
  const sigh = between(p, 0.5, 0.95)
  return {
    pose: {
      ...REST,
      lidLeft: 0.45 - 0.25 * fling,
      lidRight: 0.45 - 0.25 * fling,
      slant: -6,
      tuftLeft: 20 - 30 * fling,
      tuftRight: 20 - 30 * fling,
      beak: 0.5 * fling + 0.2 * slump,
      wingLeft: FOLDED + (FOLDED * -1 + 55) * fling + 100 * slump,
      wingRight: FOLDED + (FOLDED * -1 + 55) * fling + 100 * slump,
      y: -2 * fling + 2.2 * slump,
      stretch: 0.04 * fling - 0.05 * slump,
    },
    effects: [
      puff(
        50 + 18 * sigh,
        57 - 10 * sigh,
        0.5 + 0.6 * sigh,
        0.85 * Math.sin(Math.PI * sigh)
      ),
    ],
  }
}

/** Angry: lids slammed into a V, shaking, wings stamping, steam and the vein. */
const angry: Loop = (s) => {
  const p = phase(s, 0.9)
  const stamp = Math.abs(wave(s, 1.6))
  return {
    pose: {
      ...REST,
      lidLeft: 0.42,
      lidRight: 0.42,
      slant: -24,
      tuftLeft: -24,
      tuftRight: -24,
      beak: 0.25 + 0.25 * stamp,
      wingLeft: -45 + 22 * stamp,
      wingRight: -45 + 22 * stamp,
      x: 1.1 * wave(s, 0.11),
      y: 1,
      stretch: -0.04,
    },
    effects: [
      puff(30 - 5 * p, 18 - 12 * p, 0.7 + 0.7 * p, Math.sin(Math.PI * p)),
      puff(66 + 5 * p, 18 - 12 * p, 0.7 + 0.7 * p, Math.sin(Math.PI * p)),
      vein(72, 28, 0.9 + 0.2 * stamp, 1),
    ],
  }
}

/** Ceremonious: a "ta-da" with both wings, then a slow, solemn bow, sparks on the flourish. */
const ceremonious: Loop = (s) => {
  const p = phase(s, 3.2)
  const tada = between(p, 0.02, 0.18) * (1 - between(p, 0.45, 0.6))
  const bow = between(p, 0.5, 0.65) * (1 - between(p, 0.85, 0.98))
  const burst = between(p, 0.1, 0.25) * (1 - between(p, 0.35, 0.5))
  return {
    pose: {
      ...REST,
      lidLeft: 0.6 * bow,
      lidRight: 0.6 * bow,
      lowLid: 0.4 * tada,
      tuftLeft: -12 * tada + 10 * bow,
      tuftRight: -12 * tada + 10 * bow,
      beak: 0.2 * tada,
      wingLeft: FOLDED + 205 * tada,
      wingRight: FOLDED + 205 * tada + 150 * bow,
      y: -2 * tada + 3 * bow,
      tilt: 6 * bow,
      stretch: 0.05 * tada - 0.06 * bow,
    },
    effects: [
      spark(16, 22, 0.7 + 0.5 * burst, 90 * p, burst),
      spark(80, 18, 0.6 + 0.6 * burst, -90 * p, burst),
      spark(48, 6, 0.5 + 0.4 * burst, 60 * p, burst),
    ],
  }
}

// ---- Drawing a pose onto the parts ----

/** The angle, in the drawing's own degrees, a wing is rotated by for `elevation` on `side`. */
const wingAngle = (side: "left" | "right", elevation: number): number =>
  side === "right" ? -elevation : 180 + elevation

/** `pose` drawn onto the tin owlet's `nodes`, its effects after them. */
function posed(
  nodes: ReadonlyArray<CastNode>,
  pose: Pose,
  effects: ReadonlyArray<CastNode>,
  s: number,
  moment: Moment
): ReadonlyArray<CastNode> {
  let out = nodes
  // A beat's point to look at, the wing on its side points to (C1525).
  const pointWith = moment.pointing
    ? moment.aim.x >= 0
      ? "right"
      : "left"
    : undefined
  for (const side of ["left", "right"] as const) {
    const cx = TIN_OWLET_RIG.lens[side]
    const lid = side === "left" ? pose.lidLeft : pose.lidRight
    const slant = side === "left" ? -pose.slant : pose.slant
    out = moved(
      out,
      `lid-${side}`,
      `rotate(${num(slant)} ${num(cx)} ${num(TIN_OWLET_RIG.eyeLine)}) translate(0 ${num(TIN_OWLET_RIG.lidTravel * clamp(lid, 0, 1))})`
    )
    out = moved(
      out,
      `low-lid-${side}`,
      `translate(0 ${num(-8 * clamp(pose.lowLid, 0, 1))})`
    )
    const tuft = side === "left" ? -pose.tuftLeft : pose.tuftRight
    const root = TIN_OWLET_RIG.tuftRoot[side]
    out = moved(
      out,
      `tuft-${side}`,
      `rotate(${num(tuft)} ${num(root.x)} ${num(root.y)})`
    )
    const angle =
      pointWith === side
        ? (Math.atan2(moment.aim.y, moment.aim.x) * 180) / Math.PI -
          pose.tilt +
          2.5 * Math.sin(TAU * (s / 1.3))
        : wingAngle(side, side === "left" ? pose.wingLeft : pose.wingRight)
    out = moved(out, `wing-${side}`, `rotate(${num(angle)})`)
  }
  const open = clamp(pose.beak, 0, 1)
  out = moved(out, "beak-low", `translate(0 ${num(5 * open)})`)
  out = moved(
    out,
    "mouth",
    `translate(48 51.3) scale(${num(1 + 0.9 * open)} ${num(1 + 3.8 * open)}) translate(-48 -51.3)`
  )
  // A beat's own point to look at wins over the emotion's wandering eyes.
  if (!moment.pointing && (pose.lookX !== 0 || pose.lookY !== 0))
    // Further than the idle's glance and blink, never in place of them.
    out = changed(out, "eyes", (attrs) => ({
      ...attrs,
      transform: `translate(${num(pose.lookX)} ${num(pose.lookY)}) ${String(attrs.transform ?? "")}`,
    }))
  out = moved(
    out,
    "figure",
    `translate(${num(pose.x)} ${num(pose.y)}) rotate(${num(pose.tilt)} 48 84) translate(48 84) scale(${num(1 - 0.4 * pose.stretch)} ${num(1 + pose.stretch)}) translate(-48 -84)`
  )
  return [...out, ...effects]
}

const drawn =
  (loop: Loop): Redraw =>
  (nodes, tMs, moment) => {
    const s = Math.max(0, tMs) / 1000
    const { pose, effects } = loop(s)
    return posed(nodes, pose, effects, s, moment)
  }

export const TIN_OWLET_EMOTIONS: Readonly<
  Record<EmotionOf<"tin-owlet">, Redraw>
> = {
  neutral: drawn(neutral),
  curious: drawn(curious),
  taciturn: drawn(taciturn),
  happy: drawn(happy),
  perplexed: drawn(perplexed),
  anxious: drawn(anxious),
  frustrated: drawn(frustrated),
  angry: drawn(angry),
  ceremonious: drawn(ceremonious),
}
