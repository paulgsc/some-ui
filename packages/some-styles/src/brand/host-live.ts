/**
 * The living cast beyond its floor (HOST5, #3526): what a speaking character
 * does at a moment, as a pure function of its words, its seed and the time.
 * The floor (`./host`'s emotion loops and idle) says how a scene feels; this
 * says that the character is alive, in four layers:
 *
 * 1. Living (`livenessAt`): a function of speech facts only, never of the
 *    emotion or the shot (the owner, 2026-11-26: "agnostic of emotions…
 *    mouth movement emulating speech is there by definition"). The mouth or
 *    beak opens on each word; the body springs on a stressed word, sways and
 *    tilts; sustained talk tires it (a sweat bead), and silence rests it; in a
 *    pause it plays, in its own way (`PLAY_ACTS`).
 * 2. Attention (`pointAt`): a point fires only toward a target the beat
 *    names, on a word tied to it (`cue`), at most once per `pointEveryMs`. No
 *    motion here is without a cause.
 * 3. Emotion as notes (`notesAt`): a scene's emotion is a note, not a state.
 *    Its intro is a note of weight 1 at the scene's start; words may carry
 *    more (`notes`, proposed in the signature, the owner's to override). A
 *    note fires a pulse when it is strong enough, outside its emotion's
 *    refractory time, and, when it would change the emotion shown, only past
 *    the dwell and by a margin over what is showing (the debounce). A pulse
 *    shows for `EMOTION_HOLD_MS`, easing in and out, then the character is
 *    calm again. A long scene with stress peaks and no note gets one (the
 *    floor); no scene gets more than its length allows (the ceiling).
 * 4. Camera is `./host`'s (`placedAt`, the corner bubble).
 *
 * Every number is policy, keyed by the closed unions where it varies by them,
 * and each rests on the owner's tiebreaker (C1545): "natural, cohesive,
 * lifelike emulation takes the higher precedent… not jarring, not
 * distracting" (the numbers' call is C1546). Nothing reads a clock or
 * `Math.random`; a frame recomputes from the words, O(words) per call.
 */

import type { Emotion, EmotionOf, HostCharacter } from "./host"
import { clamp, smooth, TAU } from "./host-draw"

/** A note a word carries: an emotion, and how strongly, 0 to 1. */
export type NoteOf<C extends HostCharacter> = {
  readonly emotion: EmotionOf<C>
  readonly weight: number
}

/**
 * A word as said, on the beat's clock: when, how stressed (0 to 1, from the
 * take's prosody; a synthetic line's from its punctuation and emphasis),
 * the notes it carries, and whether it refers to the beat's target (`cue`).
 */
export type SpokenWordOf<C extends HostCharacter> = {
  readonly startMs: number
  readonly endMs: number
  readonly stress?: number
  readonly notes?: ReadonlyArray<NoteOf<C>>
  readonly cue?: boolean
}

export type SpokenWord = {
  [C in HostCharacter]: SpokenWordOf<C>
}[HostCharacter]

/** The living layer's numbers (C1546, resting on C1545). */
export const LIVENESS_POLICY = {
  /** A word counts as stressed from here, 0 to 1. */
  stressFrom: 0.5,
  /** The mouth's least opening on a word, before its stress adds the rest. */
  mouthLeast: 0.6,
  /** The spring on a stressed word: its height in drawing units, decay per s and frequency in Hz. */
  springUnits: 2.7,
  springDecay: 4,
  springHz: 2.2,
  /** Sway, in degrees, and its frequency in Hz. */
  swayDeg: 1.6,
  swayHz: 0.22,
  /** The bob, in drawing units, its frequency in Hz, and how far an open mouth lowers it. */
  bobUnits: 1,
  bobHz: 0.37,
  mouthDip: 1.4,
  /** Talk that tires: a sweat bead each `fatigueEveryMs` of talking, rested at `restPerMs` ms per ms of silence. */
  fatigueEveryMs: 20_000,
  restPerMs: 0.5,
  /** A pause long enough to play in, the share of them played in, and the longest act. */
  playPauseMs: 800,
  playShare: 0.65,
  playMostMs: 1200,
  /** A point: how long it lasts, and the least time between two. */
  pointMs: 1430,
  pointEveryMs: 5000,
} as const

/** Each character's playful acts, in its own identity (the owner, 2026-11-26). */
export const PLAY_ACTS = {
  mochi: ["squash", "wobble"],
  "tin-owlet": ["hop", "spin", "swing"],
} as const satisfies Readonly<Record<HostCharacter, ReadonlyArray<string>>>

export type PlayAct = (typeof PLAY_ACTS)[HostCharacter][number]

/** The body's motion beyond the floor, in the 96 box's units and degrees. */
export type BodyMotion = {
  readonly dx: number
  readonly dy: number
  readonly rot: number
  readonly sx: number
  readonly sy: number
}

/** What the living layer gives a character at a moment. */
export type Liveness = {
  /** How open the mouth or beak is, 0 to 1. */
  readonly mouth: number
  readonly body: BodyMotion
  /** How plainly tired it shows, 0 to 1 (the sweat bead's envelope). */
  readonly fatigue: number
  /** The act it plays, and how far into it, 0 to 1; null when it isn't playing. */
  readonly play: { readonly act: PlayAct; readonly u: number } | null
}

/** A stable draw in [0, 1) from two numbers: the same inputs, the same draw. */
const draw = (a: number, b: number): number => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const stressOf = (w: SpokenWord): number => w.stress ?? 0

/** The word being said at `tMs`, if any. */
const wordAt = <W extends SpokenWord>(
  words: ReadonlyArray<W>,
  tMs: number
): W | undefined => words.find((w) => tMs >= w.startMs && tMs < w.endMs)

/** How open the mouth is at `tMs`: up through each word, shut between. */
export function mouthAt(words: ReadonlyArray<SpokenWord>, tMs: number): number {
  const w = wordAt(words, tMs)
  if (w === undefined) return 0
  const u = (tMs - w.startMs) / Math.max(60, w.endMs - w.startMs)
  const P = LIVENESS_POLICY
  return (
    Math.sin(Math.PI * u) *
    (P.mouthLeast +
      (1 - P.mouthLeast) * Math.max(stressOf(w), draw(w.startMs, 1)))
  )
}

/** The sweat bead's envelope at `tMs`: each `fatigueEveryMs` of talk (rested in silence) brings one. */
export function fatigueAt(
  words: ReadonlyArray<SpokenWord>,
  tMs: number
): number {
  const P = LIVENESS_POLICY
  let talk = 0
  let last = words[0]?.startMs ?? 0
  let next = P.fatigueEveryMs
  let since = -1
  for (const w of words) {
    if (w.startMs > tMs) break
    talk =
      Math.max(0, talk - P.restPerMs * Math.max(0, w.startMs - last)) +
      (Math.min(w.endMs, tMs) - w.startMs)
    last = w.endMs
    if (talk >= next) {
      since = Math.min(w.endMs, tMs)
      next += P.fatigueEveryMs
    }
  }
  if (since < 0) return 0
  return pulseEnvelope(tMs - since, NOTES_POLICY.holdMs)
}

/** A pulse's envelope `intoMs` into it: easing in, held, easing out over `holdMs`. */
export function pulseEnvelope(intoMs: number, holdMs: number): number {
  const f = NOTES_POLICY.fadeMs
  if (intoMs < 0 || intoMs >= holdMs) return 0
  return smooth(Math.min(1, intoMs / f, (holdMs - intoMs) / f))
}

/** The living layer at `tMs` for `who`, saying `words` (empty when silent), seeded by `seed`. */
export function livenessAt(
  who: HostCharacter,
  words: ReadonlyArray<SpokenWord>,
  seed: number,
  tMs: number
): Liveness {
  const P = LIVENESS_POLICY
  const s = tMs / 1000
  const mouth = mouthAt(words, tMs)
  const lastStress = [...words]
    .reverse()
    .find((w) => w.startMs <= tMs && stressOf(w) >= P.stressFrom)
  const dt =
    lastStress === undefined ? Infinity : (tMs - lastStress.startMs) / 1000
  const spring = Number.isFinite(dt)
    ? Math.exp(-P.springDecay * dt) * Math.cos(TAU * P.springHz * dt)
    : 0
  const sway = Math.sin(TAU * P.swayHz * s + seed) * P.swayDeg
  const bob =
    Math.sin(TAU * P.bobHz * s + seed * 0.7) * P.bobUnits - P.mouthDip * mouth
  const body: BodyMotion = {
    dx: 0,
    dy: bob - P.springUnits * spring,
    rot: sway,
    sx: 1 + 0.05 * spring,
    sy: 1 - 0.06 * spring,
  }
  return {
    mouth,
    body,
    fatigue: fatigueAt(words, tMs),
    play: playAt(who, words, seed, tMs),
  }
}

/** The act played in the pause around `tMs`, if this pause is one played in. */
function playAt(
  who: HostCharacter,
  words: ReadonlyArray<SpokenWord>,
  seed: number,
  tMs: number
): Liveness["play"] {
  const P = LIVENESS_POLICY
  // no play while a word is being said: only in a pause between two words
  if (words.some((w) => w.startMs <= tMs && tMs < w.endMs)) return null
  const before = [...words].reverse().find((w) => w.endMs <= tMs)
  const after = words.find((w) => w.startMs > tMs)
  if (before === undefined || after === undefined) return null
  const pause = after.startMs - before.endMs
  if (pause < P.playPauseMs || draw(before.endMs, seed) >= P.playShare)
    return null
  const span = Math.min(pause - 200, P.playMostMs)
  const u = (tMs - before.endMs - 100) / span
  if (u <= 0 || u >= 1) return null
  const acts: ReadonlyArray<PlayAct> = PLAY_ACTS[who]
  const act =
    acts[Math.floor(draw(before.endMs, seed + 3) * acts.length)] ?? acts[0]
  return act === undefined ? null : { act, u }
}

/** How far a point toward the beat's target is raised at `tMs`, 0 to 1: only on a cue word, rate-limited. */
export function pointAt(
  words: ReadonlyArray<SpokenWord>,
  hasTarget: boolean,
  tMs: number
): number {
  if (!hasTarget) return 0
  const P = LIVENESS_POLICY
  let last = -Infinity
  let fired = -Infinity
  for (const w of words) {
    if (w.startMs > tMs) break
    if (w.cue === true && w.startMs - last >= P.pointEveryMs) {
      last = w.startMs
      fired = w.startMs
    }
  }
  const into = tMs - fired
  return into >= 0 && into < P.pointMs
    ? Math.sin((Math.PI * into) / P.pointMs)
    : 0
}

// ---- Emotion as notes ----

/** The notes layer's numbers (C1546, resting on C1545). */
export const NOTES_POLICY = {
  /** A note fires a pulse from this weight (after its word's stress scales it). */
  fireFrom: 0.5,
  /** A different emotion takes over only by this margin over what is showing… */
  margin: 0.15,
  /** …and only this long after the last change. */
  dwellMs: 1200,
  /** How long a pulse shows, and how long it eases in and out. */
  holdMs: 4000,
  fadeMs: 450,
  /** The floor: a scene this long, with a word this stressed and no note of its own, gets one mid-scene. */
  floorSceneMs: 20_000,
  floorStress: 0.6,
  /** The ceiling: at most the intro plus this many notes a minute. */
  perMinute: 4,
} as const

/** How long an emotion rests before it may pulse again (C1546): the louder ones rest longer. */
export const EMOTION_REFRACTORY_MS = {
  neutral: 0,
  curious: 6000,
  taciturn: 6000,
  happy: 6000,
  perplexed: 6000,
  anxious: 8000,
  frustrated: 8000,
  angry: 10_000,
  ceremonious: 10_000,
  hungry: 8000,
  question: 6000,
  confusion: 6000,
  issue: 8000,
  intuition: 8000,
  hesitation: 6000,
} as const satisfies Readonly<Record<Emotion, number>>

/** A pulse of a scene's emotion: when it fires, and which. */
export type Pulse<E extends Emotion = Emotion> = {
  readonly atMs: number
  readonly emotion: E
  readonly weight: number
}

/** A scene for the notes layer: when it starts and ends, its intro emotion, and its words. */
export type NoteScene<C extends HostCharacter> = {
  readonly startMs: number
  readonly endMs: number
  readonly intro: EmotionOf<C>
  readonly words: ReadonlyArray<SpokenWordOf<C>>
}

/**
 * The scene's pulses, in order: the intro, then the words' notes through the
 * debounce and each emotion's refractory time, the floor's note if owed, all
 * under the ceiling. A pure function of the scene; `notesAt` reads it.
 */
/** How long `e` keeps from pulsing again, whichever character feels it. */
const refractoryOf = (e: Emotion): number => EMOTION_REFRACTORY_MS[e]

export function pulsesOf<C extends HostCharacter>(
  scene: NoteScene<C>
): ReadonlyArray<Pulse<EmotionOf<C>>> {
  const N = NOTES_POLICY
  const dur = scene.endMs - scene.startMs
  type E = EmotionOf<C>
  const candidates: Array<Pulse<E>> = []
  for (const w of scene.words)
    for (const n of w.notes ?? [])
      candidates.push({
        atMs: w.startMs,
        emotion: n.emotion,
        weight: clamp(n.weight * (0.6 + 0.4 * (w.stress ?? 0.5)), 0, 1),
      })
  // the floor: a long scene with a stress peak and no note of its own gets one, of its intro, at its strongest word mid-scene
  if (candidates.length === 0 && dur >= N.floorSceneMs) {
    const mid = scene.words.filter(
      (w) =>
        w.startMs >= scene.startMs + 0.35 * dur &&
        w.startMs <= scene.startMs + 0.75 * dur &&
        (w.stress ?? 0) >= N.floorStress
    )
    const peak = mid.reduce<SpokenWordOf<C> | undefined>(
      (best, w) =>
        best === undefined || (w.stress ?? 0) > (best.stress ?? 0) ? w : best,
      undefined
    )
    if (peak !== undefined)
      candidates.push({ atMs: peak.startMs, emotion: scene.intro, weight: 0.8 })
  }
  const fired: Array<Pulse<E>> = [
    { atMs: scene.startMs, emotion: scene.intro, weight: 1 },
  ]
  const lastOf = new Map<E, number>([[scene.intro, scene.startMs]])
  let lastChange = scene.startMs
  for (const c of candidates.sort(
    (a, b) => a.atMs - b.atMs || b.weight - a.weight
  )) {
    if (c.weight < N.fireFrom || c.emotion === "neutral") continue
    const showing = fired.at(-1)
    if (showing === undefined) continue
    const rest = refractoryOf(c.emotion)
    if (c.atMs - (lastOf.get(c.emotion) ?? -Infinity) < rest) continue
    if (c.emotion !== showing.emotion) {
      const still =
        showing.weight * pulseEnvelope(c.atMs - showing.atMs, N.holdMs)
      if (c.atMs - lastChange < N.dwellMs || c.weight < still + N.margin)
        continue
      lastChange = c.atMs
    }
    fired.push(c)
    lastOf.set(c.emotion, c.atMs)
  }
  // the ceiling: the intro, then the strongest notes the scene's length allows, kept in order
  const most = Math.floor((dur / 60_000) * N.perMinute)
  const kept = fired
    .slice(1)
    .sort((a, b) => b.weight - a.weight || a.atMs - b.atMs)
    .slice(0, most)
  return [fired[0], ...kept.sort((a, b) => a.atMs - b.atMs)].filter(
    (p): p is Pulse<E> => p !== undefined
  )
}

/** Which emotion shows at `tMs`, and how strongly, 0 (calm) to 1. */
export function notesAt<E extends Emotion>(
  pulses: ReadonlyArray<Pulse<E>>,
  tMs: number
): { readonly emotion: E | null; readonly weight: number } {
  const p = [...pulses].reverse().find((x) => x.atMs <= tMs)
  if (p === undefined) return { emotion: null, weight: 0 }
  const w = pulseEnvelope(tMs - p.atMs, NOTES_POLICY.holdMs)
  return { emotion: w > 0 ? p.emotion : null, weight: w }
}
