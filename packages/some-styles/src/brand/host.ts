/**
 * The living cast (HOST1, #3522): the essays' two characters as a host over
 * a picture, every choice a scene makes about them a member of a closed
 * union known at compile time, and what they look like at a moment a pure
 * function of that choice and the time.
 *
 * - The characters are exactly two of the cast's (`./cast`): the tin owlet
 *   (Tin Bird, the agent) and the mochi (the owner). Looks vary by theme,
 *   costume and expression, never by adding a character.
 * - A beat is a scene's choice for one character from `atMs` on: its
 *   emotion, an optional ceremonious animation, its shot, its placement,
 *   whether it speaks. Emotions and ceremonies are keyed by character, so
 *   the type of a tin owlet's beat refuses the mochi's own emotions. A new
 *   emotion is a new member of `EMOTIONS` and a new entry in each drawing
 *   table it is keyed by, which the compiler asks for; never a module of its
 *   own. The cut list's schema (`@some-ui/burn-ins`) is held to the same
 *   lists by its tests, member by member.
 * - A beat may name the role the character plays (HOST7, `./host-role`):
 *   a role's theme, costume and prop are closed sets keyed by character,
 *   and some emotions add a colour of their own over the role's theme. A
 *   beat with no role is the character's everyday self.
 * - Placement follows C1485: the host is a layer of its own over the card,
 *   in a corner or the center of the area it is given, and reserves no room
 *   in it. Its translucency and fade are its own (`opacity`), and where it
 *   looks is a generic point it is given (`lookAt`), never the content.
 * - Idle life (blink, breath, glance, the key's turn) is a seeded pure
 *   function of t: the same beats, seed and t give the same SVG bytes in
 *   one engine (numbers are rounded to three places, so engines whose
 *   `Math.sin` differs in the last bits almost never disagree)
 *   (`__tests__/host.test.ts`). Nothing here reads a clock or `Math.random`.
 *
 * Each emotion's and ceremony's own drawing fills its entry in
 * `EMOTION_DRAWINGS` or `CEREMONY_DRAWINGS`: the tin owlet's loops are
 * HOST3's (#3524, `./host-tin-owlet`), the mochi's HOST4's (#3525,
 * `./host-mochi`). That is the floor. Beyond it (HOST5, #3526,
 * `./host-live`), a beat that names its `words` is alive: it speaks, springs,
 * tires and plays from its words alone; its emotion shows as notes that
 * pulse and fade rather than a sign that stays; it points only at a
 * `target`; and at a corner it sits in its own bubble (`frame`). A change
 * of beat, or of the note showing, blends one pose into the other in one
 * drawing (`blendNodes`, #3564), never two drawings over each other.
 *
 * The essays draw it as the burn-ins' `host` kind (`@some-ui/burn-ins`); the
 * Cast wing (HOST8) and the signature (HOST16) preview it from here.
 */

import { unitIntervalsBySeed } from "@some-ui/core-utils"

import {
  CAST_VIEW_BOX,
  castNodes,
  el,
  INK,
  nodesText,
  type CastNode,
  type Character,
} from "./cast"
import {
  clamp,
  lerp,
  moved,
  num,
  retouched,
  smooth,
  TAU,
  type Moment,
  type Redraw,
  type Spot,
} from "./host-draw"
import {
  livenessAt,
  notesAt,
  pointAt,
  pulsesOf,
  type Liveness,
  type SpokenWordOf,
  type WordSpan,
} from "./host-live"
import { MOCHI_CEREMONIES, MOCHI_EMOTIONS } from "./host-mochi"
import { dressed, roleLookOf, tintAt, type RoleOf } from "./host-role"
import { TIN_OWLET_EMOTIONS } from "./host-tin-owlet"

/** The host's characters: Tin Bird and Mochi, and no other. */
export const HOST_CHARACTERS = [
  "tin-owlet",
  "mochi",
] as const satisfies ReadonlyArray<Character>

export type HostCharacter = (typeof HOST_CHARACTERS)[number]

/**
 * What either character may feel: the owner's six (anxious, frustrated,
 * angry, ceremonious, happy, perplexed) and the quieter ones a conversation
 * spends most of its time in (neutral, curious, taciturn).
 */
export const SHARED_EMOTIONS = [
  "neutral",
  "curious",
  "taciturn",
  "happy",
  "perplexed",
  "anxious",
  "frustrated",
  "angry",
  "ceremonious",
  // The owner, 2026-11-26: "when they're hungry, they can actually change
  // color" (C1542). Its colour is `./host-role`'s tint.
  "hungry",
] as const

/** Each character's emotions: the shared ones, then its own beats. */
export const EMOTIONS = {
  "tin-owlet": [...SHARED_EMOTIONS],
  // The owner's own beats (2026-11-24): "questions, confusion, issues,
  // intuitions. And hesitations."
  mochi: [
    ...SHARED_EMOTIONS,
    "question",
    "confusion",
    "issue",
    "intuition",
    "hesitation",
  ],
} as const satisfies Record<HostCharacter, ReadonlyArray<string>>

export type EmotionOf<C extends HostCharacter> = (typeof EMOTIONS)[C][number]
export type Emotion = EmotionOf<HostCharacter>

/**
 * Each character's ceremonious animations, played over its emotion when a
 * beat names one. The mochi is an NFL fan: when it's excited, it
 * celebrates like one (the owner, 2026-11-24).
 */
export const CEREMONIES = {
  "tin-owlet": [],
  mochi: ["nfl-celebration"],
} as const satisfies Record<HostCharacter, ReadonlyArray<string>>

export type CeremonyOf<C extends HostCharacter> = (typeof CEREMONIES)[C][number]

/** How large the host is drawn: a close-up can hold the screen, a long shot keeps to a corner. */
export const SHOTS = ["close-up", "medium", "long"] as const
export type Shot = (typeof SHOTS)[number]

/** Where in its area the host sits (C1485). */
export const PLACEMENTS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
  "center",
] as const
export type Placement = (typeof PLACEMENTS)[number]

export type { Spot } from "./host-draw"

/**
 * The bubble a corner shot sits in (HOST5, picture-in-picture): a circle, a
 * hexagon, or none. Only a corner placement has one (C1548); a close-up, a
 * medium or long shot at the center, has nothing around it.
 */
export const FRAMES = ["circle", "hex", "none"] as const
export type Frame = (typeof FRAMES)[number]

/** One character's beat: what it does from `atMs` until the next beat. */
export type BeatOf<C extends HostCharacter> = {
  readonly atMs: number
  readonly character: C
  readonly emotion: EmotionOf<C>
  readonly animation?: CeremonyOf<C>
  readonly shot: Shot
  readonly placement: Placement
  readonly speaking: boolean
  /** The role it plays, which gives it a look (`./host-role`); its everyday self when none. */
  readonly role?: RoleOf<C>
  /** How solid the host is, 0 (gone) to 1, the default: a fade gives the content the stage. */
  readonly opacity?: number
  /** Where the host looks; its idle glances when it is given nowhere. */
  readonly lookAt?: Spot
  /**
   * What it says, each word's times on the video's clock (milliseconds from
   * the video's start, as `atMs` is; `./host-live`): its mouth moves with
   * them and its notes ride on them. A speaking beat in a cut list must name
   * them (`@some-ui/burn-ins`). A beat without them still lives: it breathes,
   * sways, bobs and plays in its silence, and its emotion pulses and fades.
   */
  readonly words?: ReadonlyArray<SpokenWordOf<C>>
  /**
   * What it hears others say while it listens, on the same clock (#3580):
   * its play waits for a pause in the whole conversation, not only its own.
   * Without it, a listener plays in its own silence.
   */
  readonly hears?: ReadonlyArray<WordSpan>
  /** What it may point at, a point in its area (0 to 1 each way): a cue word raises the point. */
  readonly target?: Spot
  /** Its bubble at a corner; a circle when none is named. */
  readonly frame?: Frame
}

/** A beat of either character: the `character` decides which emotions it may name. */
export type Beat = { readonly [C in HostCharacter]: BeatOf<C> }[HostCharacter]

/** Each character's emotions, for a page listing them. */
export const emotionsOf = <C extends HostCharacter>(
  who: C
): ReadonlyArray<EmotionOf<C>> => EMOTIONS[who]

/** Each character's ceremonies, for a page listing them. */
export const ceremoniesOf = <C extends HostCharacter>(
  who: C
): ReadonlyArray<CeremonyOf<C>> => CEREMONIES[who]

/** A box in the frame, in pixels. */
export type Area = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Each character's emotions, drawn: Tin Bird's by HOST3 (#3524), Mochi's by HOST4 (#3525). */
const EMOTION_DRAWINGS: {
  readonly [C in HostCharacter]: Readonly<Record<EmotionOf<C>, Redraw>>
} = {
  "tin-owlet": TIN_OWLET_EMOTIONS,
  mochi: MOCHI_EMOTIONS,
}

/** Each character's ceremonies, drawn: the NFL celebration by HOST4 (#3525). */
const CEREMONY_DRAWINGS: {
  readonly [C in HostCharacter]: Readonly<Record<CeremonyOf<C>, Redraw>>
} = {
  "tin-owlet": {},
  mochi: MOCHI_CEREMONIES,
}

/** The redraw a beat's ceremony calls for, if it names one. */
function ceremonyOf<C extends HostCharacter>(
  who: C,
  animation: CeremonyOf<C> | undefined
): ReadonlyArray<Redraw> {
  if (animation === undefined) return []
  const table: Readonly<Record<CeremonyOf<C>, Redraw>> = CEREMONY_DRAWINGS[who]
  return [table[animation]]
}

/** The redraws a beat's emotion and ceremony call for. */
function redrawsOf(beat: Beat): ReadonlyArray<Redraw> {
  switch (beat.character) {
    case "tin-owlet": {
      return [
        EMOTION_DRAWINGS["tin-owlet"][beat.emotion],
        ...ceremonyOf("tin-owlet", beat.animation),
      ]
    }
    case "mochi": {
      return [
        EMOTION_DRAWINGS.mochi[beat.emotion],
        ...ceremonyOf("mochi", beat.animation),
      ]
    }
    default: {
      const never: never = beat
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

/**
 * The drawing in the beat's role, coloured by its feeling `loopMs` into its
 * loop (`./host-role`, HOST7): drawn after the loop, so the costume moves
 * with the posed figure and the tint lies over the role's theme.
 */
function inRole(
  beat: Beat,
  nodes: ReadonlyArray<CastNode>,
  loopMs: number
): ReadonlyArray<CastNode> {
  const tint = tintAt(beat.emotion, loopMs)
  switch (beat.character) {
    case "tin-owlet": {
      const look = roleLookOf("tin-owlet", beat.role ?? "default")
      return dressed("tin-owlet", nodes, look, tint)
    }
    case "mochi": {
      const look = roleLookOf("mochi", beat.role ?? "default")
      return dressed("mochi", nodes, look, tint)
    }
    default: {
      const never: never = beat
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

// ---- Seeded idle life: blink, glance, breath, the key's turn ----

/** A moment of a seeded schedule: when, and three draws to spend on it. */
type Tick = {
  readonly s: number
  readonly a: number
  readonly b: number
  readonly c: number
}

/**
 * The ticks of a schedule up to `untilS`, one every `every` s plus up to
 * `spread` s more. Cost: O(untilS / every) per call, under 300 ticks for a
 * ten-minute video, so a frame stays a pure function of t with no state kept.
 */
function ticks(
  seed: number,
  every: number,
  spread: number,
  untilS: number
): ReadonlyArray<Tick> {
  const r = unitIntervalsBySeed(seed)
  const out: Array<Tick> = []
  for (let s = 0.6 + r() * every; s <= untilS; s += every + r() * spread) {
    out.push({ s, a: r(), b: r(), c: r() })
  }
  return out
}

/** How closed the eyes are at `s`, 0 to 1: a blink every few seconds, a fifth of them double. */
function blinkAt(seed: number, s: number): number {
  let closed = 0
  for (const b of ticks(seed, 2.3, 3.2, s)) {
    for (const at of b.a < 0.22 ? [b.s, b.s + 0.3] : [b.s]) {
      const p = (s - at) / 0.19
      if (p >= 0 && p <= 1) closed = Math.max(closed, 1 - Math.abs(2 * p - 1))
    }
  }
  return smooth(closed)
}

/** Where the eyes wander at `s`, each axis -1 to 1; a third of glances come back to the viewer. */
function glanceAt(seed: number, s: number): Spot {
  const last = ticks(seed ^ 0x9e3779b9, 1.4, 2.2, s).at(-1)
  return last === undefined || last.c < 0.33
    ? { x: 0, y: 0 }
    : { x: (last.a - 0.5) * 0.7, y: (last.b - 0.5) * 0.4 }
}

/** The host's idle at `s` seconds: what every loop rides on. */
export type Idle = {
  /** How closed the eyes are, 0 to 1. */
  readonly blink: number
  /** The breath's phase, -1 to 1. */
  readonly breath: number
  /** Where the eyes wander, each axis -1 to 1. */
  readonly glance: Spot
  /** How far the tin owlet's key has turned, in degrees. */
  readonly keyTurn: number
}

/** The idle life at `tMs` for `seed`: a pure function of the two. */
export function idleAt(seed: number, tMs: number): Idle {
  const s = Math.max(0, tMs) / 1000
  return {
    blink: blinkAt(seed, s),
    breath: Math.sin((TAU * s) / 3.4),
    glance: glanceAt(seed, s),
    keyTurn: 130 * s,
  }
}

// ---- Where the host sits ----

/**
 * Each shot's size, a share of its area's shorter side. A host's area stops
 * above the captions (`@some-ui/burn-ins`'s `drawHost` gives it the safe
 * area less the lower third), so no shot covers them. The sizes, and a
 * bubble's 1.2× growth, are C1566's.
 */
export const SHOT_SIZE: Readonly<Record<Shot, number>> = {
  "close-up": 0.9,
  medium: 0.56,
  long: 0.37,
}

/**
 * The host's square box for `shot` at `placement` inside `area`. A close-up
 * is the main shot: it centers, whatever its placement (C1547, the owner kept
 * o4 centered).
 */
export function placedBox(area: Area, shot: Shot, placement: Placement): Area {
  const size = Math.min(area.width, area.height) * SHOT_SIZE[shot]
  const left = area.x
  const right = area.x + area.width - size
  const top = area.y
  const bottom = area.y + area.height - size
  const middle = {
    x: area.x + (area.width - size) / 2,
    y: area.y + (area.height - size) / 2,
  }
  const at: Readonly<Record<Placement, { x: number; y: number }>> = {
    "bottom-right": { x: right, y: bottom },
    "bottom-left": { x: left, y: bottom },
    "top-right": { x: right, y: top },
    "top-left": { x: left, y: top },
    center: middle,
  }
  return {
    ...(shot === "close-up" ? middle : at[placement]),
    width: size,
    height: size,
  }
}

/** Whether a beat sits in a bubble: a corner, at a medium or long shot, with a frame (C1548). */
const framed = (beat: Beat): boolean =>
  beat.shot !== "close-up" &&
  beat.placement !== "center" &&
  (beat.frame ?? "circle") !== "none"

// ---- The host at a moment ----

/** How long a beat takes to arrive from the one before, when the character stays. */
export const BEAT_BLEND_MS = 380

/** What the host shows at a moment. */
export type HostFrame = {
  readonly beat: Beat
  /** Where it is drawn, in the area's own pixels. */
  readonly box: Area
  readonly opacity: number
  /** How much of its bubble shows, 0 to 1: it grows in at a corner and dissolves away from one. */
  readonly bubble: number
  /** What the living layer gave it: every beat lives, speaking or not. */
  readonly live: Liveness
  /** The emotion showing over the calm self, and how strongly (`emotion` null when calm). */
  readonly note: {
    readonly emotion: Emotion | null
    readonly weight: number
  }
  /** The drawing, a standalone `<svg>` the size of `box`. */
  readonly svg: string
}

const mixBox = (a: Area, b: Area, e: number): Area => ({
  x: lerp(a.x, b.x, e),
  y: lerp(a.y, b.y, e),
  width: lerp(a.width, b.width, e),
  height: lerp(a.height, b.height, e),
})

/** Where each character's eyes sit in the 96 box: the line a blink closes on. */
const EYE_LINE: Readonly<Record<HostCharacter, number>> = {
  "tin-owlet": 41,
  mochi: 55,
}

/** Where the eyes aim: toward `lookAt` from the box's center, or the idle's glance. */
function aimOf(beat: Beat, box: Area, area: Area, idle: Idle): Spot {
  if (beat.lookAt === undefined) return idle.glance
  return towards(beat.lookAt, box, area)
}

/** A unit step from the box's center toward `spot` in `area`. */
function towards(spot: Spot, box: Area, area: Area): Spot {
  const dx = area.x + spot.x * area.width - (box.x + box.width / 2)
  const dy = area.y + spot.y * area.height - (box.y + box.height / 2)
  const far = Math.hypot(dx, dy)
  return far === 0 ? { x: 0, y: 0 } : { x: dx / far, y: dy / far }
}

/**
 * The floor's drawing of `beat` at `tMs`, its emotion's loop timed from
 * `emotionFromMs` and its ceremony's from `ceremonyFromMs` (each keeps its
 * own run, #3564), before the breath and the frame.
 */
function floorNodes(
  beat: Beat,
  tMs: number,
  seed: number,
  aim: Spot,
  idPrefix: string,
  emotionFromMs: number,
  ceremonyFromMs: number
): ReadonlyArray<CastNode> {
  const idle = idleAt(seed, tMs)
  const who = beat.character
  const eye = EYE_LINE[who]
  const squash = 1 - 0.92 * idle.blink
  let nodes = castNodes(who, (name) => `${idPrefix}-${name}`)
  nodes = moved(
    nodes,
    "eyes",
    `translate(${num(aim.x * 2)} ${num(aim.y * 1.5)}) translate(0 ${num(eye)}) scale(1 ${num(squash)}) translate(0 ${num(-eye)})`
  )
  const turn = Math.cos((idle.keyTurn * Math.PI) / 180)
  nodes = moved(
    nodes,
    "key",
    `translate(80 46) scale(1 ${num(Math.sign(turn || 1) * Math.max(0.1, Math.abs(turn)))}) translate(-80 -46)`
  )
  const moment: Moment = { aim, pointing: beat.lookAt !== undefined }
  const [emotion, ...ceremonies] = redrawsOf(beat)
  if (emotion !== undefined) nodes = emotion(nodes, tMs - emotionFromMs, moment)
  for (const ceremony of ceremonies)
    nodes = ceremony(nodes, tMs - ceremonyFromMs, moment)
  return inRole(beat, nodes, tMs - emotionFromMs)
}

/** The breath under every drawing, from the idle. */
const breathOf = (seed: number, tMs: number): string => {
  const b = idleAt(seed, tMs).breath
  return `translate(48 84) scale(${num(1 - 0.006 * b)} ${num(1 + 0.013 * b)}) translate(-48 -84)`
}

/** The character of `beat` alive at `tMs`, the floor alone, as SVG text `size` px square. */
export function hostSvg(
  beat: Beat,
  tMs: number,
  seed: number,
  size: number,
  aim: Spot,
  idPrefix: string = `host-${beat.character}`
): string {
  const nodes = floorNodes(beat, tMs, seed, aim, idPrefix, beat.atMs, beat.atMs)
  return svgOf(nodes, size, breathOf(seed, tMs), "", 0, beat)
}

// ---- One drawing from two poses ----

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g
/** A plain `#rrggbb` paint, its channels captured. */
const HEX = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i

/** The colour `w` of the way from `a` to `b`, channel by channel. */
const hexBetween = (
  a: RegExpExecArray,
  b: RegExpExecArray,
  w: number
): string =>
  `#${[1, 2, 3]
    .map((i) =>
      Math.round(lerp(parseInt(a[i] ?? "0", 16), parseInt(b[i] ?? "0", 16), w))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`

/** One attribute between two poses: numbers in the same places blend; anything else switches at the middle. */
function blendValue(
  a: string | number | undefined,
  b: string | number | undefined,
  w: number,
  key: string
): string | number | undefined {
  const fallback = key === "opacity" ? 1 : undefined
  const x = a ?? fallback
  const y = b ?? fallback
  if (x === undefined || y === undefined) return w < 0.5 ? a : b
  if (typeof x === "number" && typeof y === "number")
    return Number(num(lerp(x, y, w)))
  const sx = String(x)
  const sy = String(y)
  if (sx === sy) return x
  const cx = HEX.exec(sx)
  const cy = HEX.exec(sy)
  if (cx !== null && cy !== null) return hexBetween(cx, cy, w)
  // a paint that isn't a plain hex colour (a url, a named colour) switches at the middle
  if (sx.includes("#") || sy.includes("#")) return w < 0.5 ? x : y
  const nx = sx.match(NUMBER) ?? []
  const ny = sy.match(NUMBER) ?? []
  if (
    nx.length === 0 ||
    nx.length !== ny.length ||
    sx.replace(NUMBER, "#") !== sy.replace(NUMBER, "#")
  )
    return w < 0.5 ? x : y
  let k = 0
  return sx.replace(NUMBER, () => {
    const v = num(lerp(Number(nx[k]), Number(ny[k]), w))
    k += 1
    return v
  })
}

/**
 * One drawing `w` of the way from pose `a` to pose `b` (#3564): the same
 * tree, its numbers blended where both poses have them in the same places, so
 * a sign fades, a tilt eases and a stretch settles; what can't blend switches
 * at the middle. Never two drawings over each other, so no body shows twice.
 */
export function blendNodes(
  a: ReadonlyArray<CastNode>,
  b: ReadonlyArray<CastNode>,
  w: number
): ReadonlyArray<CastNode> {
  if (w <= 0) return a
  if (w >= 1) return b
  if (a.length !== b.length) return w < 0.5 ? a : b
  return a.map((x, i) => {
    const y = b[i]
    if (x.tag !== y?.tag) return w < 0.5 ? x : (y ?? x)
    const keys = [
      ...new Set([...Object.keys(x.attrs), ...Object.keys(y.attrs)]),
    ]
    const attrs: Record<string, string | number> = {}
    for (const key of keys) {
      const v = blendValue(x.attrs[key], y.attrs[key], w, key)
      if (v !== undefined) attrs[key] = v
    }
    const children =
      x.children === undefined || y.children === undefined
        ? w < 0.5
          ? x.children
          : y.children
        : blendNodes(x.children, y.children, w)
    return children === undefined
      ? { tag: x.tag, attrs }
      : { tag: x.tag, attrs, children }
  })
}

// ---- Beyond the floor: what the living layer draws ----

/** Each character's bubble ring, by the role it plays (HOST7's roles): its colour on screen. */
const RING: {
  readonly [C in HostCharacter]: Readonly<Record<RoleOf<C>, string>>
} = {
  mochi: {
    default: "#e0a31c",
    analyst: "#2a9fa6",
    coach: "#e8452c",
    fan: "#f0782c",
    presenter: "#3b4fd8",
  },
  "tin-owlet": {
    default: "#8fa3b8",
    analyst: "#2a9fa6",
    coach: "#e8452c",
    fan: "#f0782c",
    presenter: "#3b4fd8",
  },
}

const ringOf = (beat: Beat): string => {
  switch (beat.character) {
    case "mochi": {
      return RING.mochi[beat.role ?? "default"]
    }
    case "tin-owlet": {
      return RING["tin-owlet"][beat.role ?? "default"]
    }
    default: {
      const never: never = beat
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

/** `extra` added as the last children of the group carrying `part`. */
const appended = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  extra: ReadonlyArray<CastNode>
): ReadonlyArray<CastNode> =>
  nodes.map((node) => {
    const children =
      node.children === undefined
        ? undefined
        : appended(node.children, part, extra)
    const own =
      node.attrs["data-part"] === part
        ? [...(children ?? []), ...extra]
        : children
    return own === undefined
      ? { tag: node.tag, attrs: node.attrs }
      : { tag: node.tag, attrs: node.attrs, children: own }
  })

/** The angle a part's own `rotate(…)` holds it at: 0 when it has none, null when no node is `part`. */
function restAngle(
  nodes: ReadonlyArray<CastNode>,
  part: string
): number | null {
  for (const node of nodes) {
    if (node.attrs["data-part"] === part) {
      const turn = /rotate\((-?[\d.]+)/.exec(String(node.attrs.transform ?? ""))
      return turn === null ? 0 : Number(turn[1])
    }
    const inner =
      node.children === undefined ? null : restAngle(node.children, part)
    if (inner !== null) return inner
  }
  return null
}

/** `deg` as the shorter turn, within ±180. */
const shortTurn = (deg: number): number =>
  ((((deg + 180) % 360) + 360) % 360) - 180

/** The play act's transform at its phase: each character's own (`PLAY_ACTS`). */
function playTransform(play: Liveness["play"]): string {
  if (play === null) return ""
  const { act, u } = play
  const k = Math.sin(Math.PI * u)
  switch (act) {
    case "squash": {
      const q = Math.sin(TAU * u)
      return `translate(48 88) scale(${num(1 + 0.12 * q)} ${num(1 - 0.12 * q)}) translate(-48 -88) translate(0 ${num(-6 * Math.max(0, -q))})`
    }
    case "wobble": {
      return `rotate(${num(7 * Math.sin(2 * TAU * u) * k)} 48 84)`
    }
    case "hop": {
      return `translate(0 ${num(-9 * k)})`
    }
    case "spin": {
      return `translate(48 0) scale(${num(Math.cos(TAU * u))} 1) translate(-48 0)`
    }
    case "swing": {
      return `rotate(${num(12 * Math.sin(1.5 * TAU * u) * (1 - u))} 48 96)`
    }
    default: {
      const never: never = act
      throw new Error(`no such act: ${String(never)}`)
    }
  }
}

/** The living layer drawn onto the floor's nodes: the mouth or beak, a point, the sweat bead. */
function livened(
  who: HostCharacter,
  nodes: ReadonlyArray<CastNode>,
  live: Liveness,
  point: number,
  toward: Spot
): ReadonlyArray<CastNode> {
  let out = nodes
  const m = live.mouth
  if (who === "mochi") {
    if (m > 0.08)
      out = appended(
        retouched(
          out,
          "mouth",
          {
            opacity: num(Math.max(0, 1 - 3 * m)),
          },
          "translate(0 0)"
        ),
        "face",
        [
          el("ellipse", {
            cx: 48,
            cy: 63.6,
            rx: num(2.6 + 1.6 * m),
            ry: num(0.6 + 3.4 * m),
            fill: INK,
            "data-part": "talk",
          }),
          el("ellipse", {
            cx: 48,
            cy: num(64.2 + 1.8 * m),
            rx: num(1.4 + 0.8 * m),
            ry: num(0.4 + 1.2 * m),
            fill: "#e46a6a",
            opacity: 0.9,
          }),
        ]
      )
  } else out = retouched(out, "beak-low", {}, `translate(0 ${num(3.6 * m)})`)
  if (point > 0) {
    const side = toward.x < 0 ? "left" : "right"
    const angle = (Math.atan2(toward.y, toward.x) * 180) / Math.PI
    if (who === "mochi") {
      const sx = side === "left" ? 24 : 72
      const rest = side === "left" ? 180 : 0
      const turn = clamp(shortTurn(angle - rest), -80, 80)
      out = retouched(
        out,
        `arm-${side}`,
        { opacity: num(Math.min(1, point * 3)) },
        `translate(${sx} 60) rotate(${num(turn * point)}) translate(${-sx} -60)`
      )
    } else {
      // the wing turns from where its pose holds it toward the target, the short way round,
      // and stays within 35° of pointing outward, where the body can't hide it
      const outward = side === "left" ? 180 : 0
      const aim = outward + clamp(shortTurn(angle - outward), -35, 35)
      const rest = restAngle(out, `wing-${side}`) ?? 0
      out = retouched(
        out,
        `wing-${side}`,
        {},
        `rotate(${num(shortTurn(aim - rest) * point)})`
      )
    }
  }
  if (live.fatigue > 0.02)
    out = [
      ...out,
      el("path", {
        d: "M0 -6C2.5 -2 4 0.5 4 2.5A4 4 0 0 1 -4 2.5C-4 0.5 -2.5 -2 0 -6Z",
        fill: "#9fd8ff",
        stroke: "#3b6ea5",
        "stroke-width": 0.6,
        opacity: num(0.95 * live.fatigue),
        transform: `translate(${who === "mochi" ? 74 : 70} ${num(24 + 8 * (1 - live.fatigue))})`,
        "data-part": "tired",
      }),
    ]
  return out
}

/** The bubble's outline, in the 96 box. */
const bubblePath = (frame: Frame): string =>
  frame === "hex"
    ? "M48 2L88 25V71L48 94L8 71V25Z"
    : "M48 2A46 46 0 1 1 47.99 2Z"

/** The drawing as SVG text: the breath, the living body, and the bubble when it shows. */
function svgOf(
  nodes: ReadonlyArray<CastNode>,
  size: number,
  breath: string,
  motion: string,
  bubble: number,
  beat: Beat,
  idPrefix: string = `host-${beat.character}`
): string {
  const body = nodesText(nodes, { ground: "none", glow: false })
  const inner =
    motion === ""
      ? `<g transform="${breath}">${body}</g>`
      : `<g transform="${breath}"><g transform="${motion}">${body}</g></g>`
  if (bubble <= 0.01)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAST_VIEW_BOX}" width="${num(size)}" height="${num(size)}">${inner}</svg>`
  const d = bubblePath(beat.frame ?? "circle")
  const clip = `${idPrefix}-bubble`
  const grow = 1 + 0.2 * bubble
  const placed = `<g transform="translate(48 ${num(48 + 9.6 * bubble)}) scale(${num(grow)}) translate(-48 -48)">${inner}</g>`
  // the clip tightens as the bubble grows: 2.5× its shape (past the whole box) at none, its shape at full, so nothing pops
  const reach = 1 + 1.5 * (1 - bubble)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAST_VIEW_BOX}" width="${num(size)}" height="${num(size)}"><defs><clipPath id="${clip}"><path d="${d}" transform="translate(48 48) scale(${num(reach)}) translate(-48 -48)"/></clipPath></defs><path d="${d}" fill="#141e45" opacity="${num(bubble)}"/><g clip-path="url(#${clip})">${placed}</g><path d="${d}" fill="none" stroke="${ringOf(beat)}" stroke-width="${num(3 * bubble)}" opacity="${num(bubble)}"/></svg>`
}

/** Where the host is drawn, how solid, and how much of its bubble shows. */
type Placed = {
  readonly box: Area
  readonly opacity: number
  readonly bubble: number
}

/**
 * Where beat `i` has the host at `tMs`: arriving over `BEAT_BLEND_MS` from
 * where the beat before had it when this one started, so a beat that comes
 * before the last has finished arriving starts from what was on screen; the
 * bubble grows in as it reaches a corner and dissolves as it leaves. A
 * change of character cuts. Cost: recurses only through beats less than
 * `BEAT_BLEND_MS` apart, so a run of beats on top of each other.
 */
function placedAt(
  beats: ReadonlyArray<Beat>,
  i: number,
  tMs: number,
  area: Area
): Placed {
  const beat = beats[i]
  if (beat === undefined) throw new Error(`no beat ${String(i)}`)
  const to: Placed = {
    box: placedBox(area, beat.shot, beat.placement),
    opacity: beat.opacity ?? 1,
    bubble: framed(beat) ? 1 : 0,
  }
  const before = beats[i - 1]
  if (before?.character !== beat.character) return to
  const from =
    beat.atMs - before.atMs >= BEAT_BLEND_MS
      ? {
          box: placedBox(area, before.shot, before.placement),
          opacity: before.opacity ?? 1,
          bubble: framed(before) ? 1 : 0,
        }
      : placedAt(beats, i - 1, beat.atMs, area)
  const e = smooth((tMs - beat.atMs) / BEAT_BLEND_MS)
  return {
    box: mixBox(from.box, to.box, e),
    opacity: lerp(from.opacity, to.opacity, e),
    bubble: lerp(from.bubble, to.bubble, e),
  }
}

/**
 * When beat `i`'s runs began: its emotion's, the unbroken run of beats with
 * its character and emotion, and its ceremony's, with its character and
 * ceremony, each kept on its own (#3564), so a ceremony carries on when only
 * the emotion under it changes.
 */
function runStartsOf(
  beats: ReadonlyArray<Beat>,
  i: number
): { readonly emotion: number; readonly ceremony: number } {
  const start = (same: (b: Beat, beat: Beat) => boolean): number =>
    beats[runBounds(beats, i, same).from]?.atMs ?? beats[i]?.atMs ?? 0
  return {
    emotion: start((b, beat) => b.emotion === beat.emotion),
    ceremony: start((b, beat) => b.animation === beat.animation),
  }
}

/**
 * The unbroken stretch of beats around beat `i`, before and after it, with
 * its character and whatever `same` asks of them too: the one walk both
 * `runStartsOf` and `runOf` take.
 */
function runBounds(
  beats: ReadonlyArray<Beat>,
  i: number,
  same: (b: Beat, beat: Beat) => boolean
): { readonly from: number; readonly to: number } {
  const beat = beats[i]
  const joins = (b: Beat | undefined): boolean => {
    if (b === undefined || beat === undefined) return false
    return b.character === beat.character && same(b, beat)
  }
  let from = i
  while (from > 0 && joins(beats[from - 1])) from -= 1
  let to = i
  while (to < beats.length - 1 && joins(beats[to + 1])) to += 1
  return { from, to }
}

/**
 * Where beat `i`'s emotion run starts and ends among the beats: the unbroken
 * stretch with its character and emotion, before and after it. A move
 * inside it is not a new scene for the notes (HN1).
 */
function runOf(
  beats: ReadonlyArray<Beat>,
  i: number
): { readonly from: number; readonly to: number } {
  return runBounds(beats, i, (b, beat) => b.emotion === beat.emotion)
}

/** The run's scene for the notes ends at the beat that breaks it, or its last word plus a hold. */
function sceneEnd(beats: ReadonlyArray<Beat>, i: number): number {
  const { from, to } = runOf(beats, i)
  const after = beats[to + 1]
  if (after !== undefined) return after.atMs
  const ends = beats
    .slice(from, to + 1)
    .flatMap((b) => (b.words ?? []).map((w) => w.endMs))
  return (ends.at(-1) ?? beats[to]?.atMs ?? 0) + 4000
}

/**
 * Beat `i`'s pose at `tMs`: the note showing (`./host-live`'s pulses, its
 * intro and, when it names words, theirs) blended over its calm self in one
 * drawing, so no beat holds its sign the whole time, speaking or not.
 */
function poseOf(
  beats: ReadonlyArray<Beat>,
  i: number,
  seed: number,
  tMs: number,
  aim: Spot
): {
  readonly nodes: ReadonlyArray<CastNode>
  readonly note: HostFrame["note"]
} {
  const beat = beats[i]
  if (beat === undefined) throw new Error(`no beat ${String(i)}`)
  const starts = runStartsOf(beats, i)
  const idPrefix = `host-${beat.character}`
  const calm = floorNodes(
    { ...beat, emotion: "neutral" },
    tMs,
    seed,
    aim,
    idPrefix,
    starts.emotion,
    starts.ceremony
  )
  const pulses = pulseList(beats, i, starts.emotion, sceneEnd(beats, i))
  const note = notesAt(pulses, tMs)
  const pulse = [...pulses].reverse().find((p) => p.atMs <= tMs)
  if (note.emotion === null || pulse === undefined) return { nodes: calm, note }
  const felt = floorNodes(
    feeling(beat, note.emotion),
    tMs,
    seed,
    aim,
    idPrefix,
    pulse.atMs,
    starts.ceremony
  )
  return { nodes: blendNodes(calm, felt, note.weight), note }
}

/**
 * Beat `i`'s pulses, by its character: those of its emotion's whole run
 * (`runOf`), so the notes are the same whether the host moves inside it or
 * not, and a note fired before a move keeps showing across it (HN1).
 */
function pulseList(
  beats: ReadonlyArray<Beat>,
  i: number,
  startMs: number,
  endMs: number
): ReadonlyArray<{
  readonly atMs: number
  readonly emotion: Emotion
  readonly weight: number
}> {
  const beat = beats[i]
  if (beat === undefined) throw new Error(`no beat ${String(i)}`)
  const { from, to } = runOf(beats, i)
  const run = beats.slice(from, to + 1)
  switch (beat.character) {
    case "mochi": {
      return pulsesOf({
        startMs,
        endMs,
        intro: beat.emotion,
        // every beat in the run is Mochi (`runOf`); the test only narrows the type
        words: run.flatMap((b) =>
          b.character === "mochi" ? (b.words ?? []) : []
        ),
      })
    }
    case "tin-owlet": {
      return pulsesOf({
        startMs,
        endMs,
        intro: beat.emotion,
        // every beat in the run is Tin Bird (`runOf`); the test only narrows the type
        words: run.flatMap((b) =>
          b.character === "tin-owlet" ? (b.words ?? []) : []
        ),
      })
    }
    default: {
      const never: never = beat
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

/** Whether Tin Bird may feel `e`. */
const isTinEmotion = (e: Emotion): e is EmotionOf<"tin-owlet"> =>
  EMOTIONS["tin-owlet"].some((x) => x === e)

/** `beat` feeling `emotion`, when its character may: a pulse is always one of its own, by its words' types. */
function feeling(beat: Beat, emotion: Emotion): Beat {
  switch (beat.character) {
    case "mochi": {
      return { ...beat, emotion: emotion }
    }
    case "tin-owlet": {
      return isTinEmotion(emotion) ? { ...beat, emotion } : beat
    }
    default: {
      const never: never = beat
      throw new Error(`no such character: ${JSON.stringify(never)}`)
    }
  }
}

/**
 * What the host shows `tMs` into its run, over `area` (the frame's safe
 * area above the captions, or a preview's card): the latest beat at or
 * before `tMs`, arriving from what was on screen over `BEAT_BLEND_MS` when
 * the character stays (its box, its bubble and its pose, blended in one
 * drawing) and cutting when it changes; alive beyond the floor when the
 * beat names its words. Null before the first beat, and when there are none.
 */
export function hostAt(
  beats: ReadonlyArray<Beat>,
  seed: number,
  tMs: number,
  area: Area
): HostFrame | null {
  const first = beats[0]
  if (first === undefined || tMs < first.atMs) return null
  let i = 0
  for (const [j, b] of beats.entries()) if (b.atMs <= tMs) i = j
  const beat = beats[i] ?? first
  const { box, opacity, bubble } = placedAt(beats, i, tMs, area)
  const aim = aimOf(beat, box, area, idleAt(seed, tMs))
  const pose = poseOf(beats, i, seed, tMs, aim)
  const before = beats[i - 1]
  const e = smooth((tMs - beat.atMs) / BEAT_BLEND_MS)
  const nodes =
    before?.character === beat.character && e < 1
      ? blendNodes(poseOf(beats, i - 1, seed, tMs, aim).nodes, pose.nodes, e)
      : pose.nodes
  const words = beat.words ?? []
  const live = livenessAt(beat.character, words, seed, tMs, beat.hears)
  const toward =
    beat.target === undefined ? { x: 0, y: 0 } : towards(beat.target, box, area)
  const point = pointAt(words, beat.target !== undefined, tMs)
  const drawn = livened(beat.character, nodes, live, point, toward)
  const motion = `${playTransform(live.play)} translate(${num(live.body.dx)} ${num(live.body.dy)}) translate(48 88) rotate(${num(live.body.rot)}) scale(${num(live.body.sx)} ${num(live.body.sy)}) translate(-48 -88)`
  return {
    beat,
    box,
    opacity: clamp(opacity, 0, 1),
    bubble: clamp(bubble, 0, 1),
    live,
    note: pose.note,
    svg: svgOf(drawn, box.width, breathOf(seed, tMs), motion, bubble, beat),
  }
}
