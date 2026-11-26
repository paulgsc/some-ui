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
 * `./host-mochi`). Speaking motion is HOST5's (#3526).
 *
 * The essays draw it as the burn-ins' `host` kind (`@some-ui/burn-ins`); the
 * Cast wing (HOST8) and the signature (HOST16) preview it from here.
 */

import { unitIntervalsBySeed } from "@some-ui/core-utils"

import {
  CAST_VIEW_BOX,
  castNodes,
  nodesText,
  type CastNode,
  type Character,
} from "./cast"
import {
  clamp,
  lerp,
  moved,
  num,
  smooth,
  TAU,
  type Moment,
  type Redraw,
  type Spot,
} from "./host-draw"
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

/** Each shot's size, a share of its area's shorter side. */
const SHOT_SIZE: Readonly<Record<Shot, number>> = {
  "close-up": 0.9,
  medium: 0.5,
  long: 0.26,
}

/** The host's square box for `shot` at `placement` inside `area`. */
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
  return { ...at[placement], width: size, height: size }
}

// ---- The host at a moment ----

/** How long a beat takes to arrive from the one before, when the character stays. */
export const BEAT_BLEND_MS = 380

/** What the host shows at a moment. */
export type HostFrame = {
  readonly beat: Beat
  /** Where it is drawn, in the area's own pixels. */
  readonly box: Area
  readonly opacity: number
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
  const dx = area.x + beat.lookAt.x * area.width - (box.x + box.width / 2)
  const dy = area.y + beat.lookAt.y * area.height - (box.y + box.height / 2)
  const far = Math.hypot(dx, dy)
  return far === 0 ? { x: 0, y: 0 } : { x: dx / far, y: dy / far }
}

/** The character of `beat` alive at `tMs`, as SVG text `size` px square. */
export function hostSvg(
  beat: Beat,
  tMs: number,
  seed: number,
  size: number,
  aim: Spot,
  idPrefix: string = `host-${beat.character}`
): string {
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
  // A loop runs on its beat's own time (`hostAt` gives the start of its run).
  for (const redraw of redrawsOf(beat))
    nodes = redraw(nodes, tMs - beat.atMs, moment)
  nodes = inRole(beat, nodes, tMs - beat.atMs)
  const breath = `translate(48 84) scale(${num(1 - 0.006 * idle.breath)} ${num(1 + 0.013 * idle.breath)}) translate(-48 -84)`
  const body = nodesText(nodes, { ground: "none", glow: false })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAST_VIEW_BOX}" width="${num(size)}" height="${num(size)}"><g transform="${breath}">${body}</g></svg>`
}

/** Where the host is drawn, and how solid. */
type Placed = { readonly box: Area; readonly opacity: number }

/**
 * Where beat `i` has the host at `tMs`: arriving over `BEAT_BLEND_MS` from
 * where the beat before had it when this one started, so a beat that comes
 * before the last has finished arriving starts from what was on screen. A
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
  }
  const before = beats[i - 1]
  if (before?.character !== beat.character) return to
  const from =
    beat.atMs - before.atMs >= BEAT_BLEND_MS
      ? {
          box: placedBox(area, before.shot, before.placement),
          opacity: before.opacity ?? 1,
        }
      : placedAt(beats, i - 1, beat.atMs, area)
  const e = smooth((tMs - beat.atMs) / BEAT_BLEND_MS)
  return {
    box: mixBox(from.box, to.box, e),
    opacity: lerp(from.opacity, to.opacity, e),
  }
}

/**
 * When beat `i`'s loop began: the start of the unbroken run of beats with
 * its character, emotion and ceremony, so a beat that only moves the host
 * or has it speak carries the loop on rather than restarting it.
 */
function loopStartOf(beats: ReadonlyArray<Beat>, i: number): number {
  const beat = beats[i]
  let start = beat?.atMs ?? 0
  for (let j = i - 1; j >= 0; j--) {
    const before = beats[j]
    if (
      before?.character !== beat?.character ||
      before?.emotion !== beat?.emotion ||
      before?.animation !== beat?.animation
    )
      break
    start = before?.atMs ?? start
  }
  return start
}

/**
 * What the host shows `tMs` into its run, over `area` (the frame's safe
 * area, or a preview's card): the latest beat at or before `tMs`, arriving
 * from what was on screen over `BEAT_BLEND_MS` when the character stays and
 * cutting when it changes. Null before the first beat, and when there are
 * none.
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
  const { box, opacity } = placedAt(beats, i, tMs, area)
  const aim = aimOf(beat, box, area, idleAt(seed, tMs))
  return {
    beat,
    box,
    opacity: clamp(opacity, 0, 1),
    svg: hostSvg(
      { ...beat, atMs: loopStartOf(beats, i) },
      tMs,
      seed,
      box.width,
      aim
    ),
  }
}
