/**
 * The show's one clock (C1182): every move on the stage as a keyframe track
 * over one cycle, the whole show, so the copy, the cubes and the band titles
 * cannot drift apart however the page was opened. Pure: the resolved show in,
 * the tracks out; `render.ts` names each element by its track and
 * `showCss` writes the keyframes.
 *
 * An episode begins with the copy block turning to it about Y. Each scene
 * then streams its copy (its title, then its narration a line after
 * another), and only once the copy has landed do the episode's two cubes
 * turn about X to the scene's faces (the first scene's cubes come into view
 * instead), each band's label typing in as its face arrives, and hold. The
 * episode's cubes leave as the next episode's copy turns in. Until they first
 * arrive, their places stand as skeletons of what is coming (C1185).
 */
import type { ResolvedEpisode, ResolvedScene } from "./show.ts"

/** Characters a second the copy streams at. */
export const STREAM_CPS = 38
/** Seconds the scene's title takes to type in before its narration. */
export const TITLE_S = 0.6
/** Seconds the cubes take to turn a face, or to come into view. */
export const TURN_S = 1.2
/** Seconds a scene holds once its faces are shown. */
export const HOLD_S = 4
/**
 * Seconds the copy block takes to turn a quarter, to the next episode: a
 * turn of two quarters (three episodes wrapping through the blank face, or
 * two that face each other) takes twice as long, so every turn runs at one
 * speed.
 */
export const QUARTER_TURN_S = 1.4
/** Seconds a band's label takes to type in once its face has arrived. */
const LABEL_S = 0.9

/** One element's moves: its name (its class and its keyframes') and its keyframes. */
export type Track = { readonly name: string; readonly keyframes: string }

export type SceneTracks = {
  /**
   * Seconds into the cycle when the scene's faces are in view: from their
   * turn in until they have turned away or their pair has gone. The end
   * passes the cycle's when the last episode's last faces linger into the
   * next round. The enhancement plays a face's clip only then (C1422).
   */
  readonly on: readonly [number, number]
  /** The scene's copy, shown from its start until the next scene's. */
  readonly block: Track
  readonly title: Track
  readonly lines: ReadonlyArray<Track>
  /** Each cube's band label, typed as its face arrives. */
  readonly labels: readonly [Track, Track]
}

/**
 * One plate of the dashboard band (C1443), a place of an episode whose
 * scenes are dashboard rows: shown from when its scene's faces come into
 * view until the next scene's do, the last held until the episode comes
 * round again. On the page's first round, before any of the episode's
 * scenes has played, the first plate shows instead (`intro`, once, for
 * `introS` seconds of the show's clock).
 */
export type PlateTracks = {
  readonly loop: Track
  readonly intro: Track | null
  readonly introS: number
}

type EpisodeTracks = {
  /** Seconds into the cycle the copy block begins its turn to the episode. */
  readonly start: number
  /**
   * Where the episode's pair will be, as skeletons (C1185): standing from
   * halfway through the copy block's turn to the episode (once the last
   * pair has gone), giving way as the pair turns in.
   */
  readonly skeleton: Track
  /** The episode's pair of cubes: in view for its episode only. */
  readonly pair: Track
  readonly cubes: readonly [Track, Track]
  readonly scenes: ReadonlyArray<SceneTracks>
  /** Its places as the dashboard band's plates, in order. */
  readonly plates: ReadonlyArray<PlateTracks>
}

export type Timeline = {
  /** The whole show, in seconds: every track's one cycle. */
  readonly cycleS: number
  /** The copy block's first turn, which the show opens just past. */
  readonly openS: number
  /** The copy block's turn about Y, an episode a face. */
  readonly copy: Track
  readonly episodes: ReadonlyArray<EpisodeTracks>
}

/**
 * The scenes the show's clock times: an episode's own, or,
 * for a pool, each place timed for whichever snack a visit draws into it:
 * the pool's longest title, and its longest line at each place.
 */
export function timedScenes(
  episode: ResolvedEpisode
): ReadonlyArray<ResolvedScene> {
  if (episode.pool === null) return episode.scenes
  const longest = (texts: ReadonlyArray<string>): string =>
    texts.reduce((a, b) => ([...b].length > [...a].length ? b : a), "")
  const { snacks } = episode.pool
  const lines = Math.max(0, ...snacks.map((s) => s.narration.length))
  const narration = Array.from({ length: lines }, (_, l) =>
    longest(snacks.map((s) => s.narration[l] ?? ""))
  )
  const title = longest(snacks.map((s) => s.title))
  // A snack shorter than its place's time holds its words on screen for
  // the rest: a one-line snack is read longer, never cut short.
  return episode.scenes.map((scene) => ({ ...scene, title, narration }))
}

/** A number for CSS, rounded to three places with no trailing zeros. */
export const num = (n: number): string => String(Number(n.toFixed(3)))

/** How a point moves to the next by default: it holds, then the next takes over. */
const HOLD = "steps(1, end)"

/** A point of a track: from `at` seconds the element is `css`, eased by `ease` to the next point (held by default). */
type Point = {
  readonly at: number
  readonly css: string
  readonly ease?: string
}

/** Characters as a reader counts them. */
const chars = (text: string): number => [...text].length

/**
 * A track's keyframes over the cycle: its points in order, the state before
 * the first one being its last (the cycle wraps), and held to the end.
 */
function keyframes(
  name: string,
  cycleS: number,
  points: ReadonlyArray<Point>
): string {
  const pct = (s: number): string => `${num((s / cycleS) * 100)}%`
  const last = points.at(-1)
  // A point holds until the next unless it names how to move to it.
  const frame = (at: string, p: Point): string =>
    `${at} { ${p.css} animation-timing-function: ${p.ease ?? HOLD}; }`
  const frames = [
    ...(points.at(0)?.at === 0 || last === undefined
      ? []
      : [frame("0%", { at: 0, css: last.css })]),
    ...points.map((p) => frame(pct(p.at), p)),
    ...(last === undefined || last.at === cycleS
      ? []
      : [frame("100%", { at: cycleS, css: last.css })]),
  ]
  return `@keyframes ${name} { ${frames.join(" ")} }`
}

const SHOWN = "opacity: 1;"
const HIDDEN = "opacity: 0;"
const WIPED = "clip-path: inset(0 0 100% 0);"
const TYPED_NOT = "clip-path: inset(0 100% 0 0);"
const WHOLE = "clip-path: inset(0 0 0 0);"

/**
 * The copy block is a cube about Y, as the media blocks are about X
 * (C1424): four faces, whatever the show's episodes, which sit on them
 * spread evenly where they divide four (two face each other), else one
 * after another, the rest blank.
 */
export const COPY_FACES = 4

/** The face episode `k` of `n` sits on. */
export const copyFaceOf = (k: number, n: number): number =>
  COPY_FACES % n === 0 ? (k * COPY_FACES) / n : k

/** The copy cube's perspective, in its widths (`.ring`'s 340cqi). */
const COPY_PERSPECTIVE = 3.4

/**
 * How much the copy cube shrinks at `deg`, so it never reaches past its
 * block: a square turned off square-on is wider than its side (its diagonal
 * at 45 degrees), and perspective widens it again. 1 square-on, about 0.8
 * at 45 degrees: the largest scale whose four corners, projected, stay
 * within half a width of the middle.
 */
export function copyScaleAt(deg: number): number {
  const a = (deg * Math.PI) / 180
  const reach = Math.max(
    ...[
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [-0.5, -0.5],
    ].map(([x = 0, z = 0]) => {
      // Turned about Y, about the cube's middle, half a width behind the face.
      const xr = x * Math.cos(a) + z * Math.sin(a)
      const zr = -x * Math.sin(a) + z * Math.cos(a) - 0.5
      return Math.abs(xr) * (COPY_PERSPECTIVE / (COPY_PERSPECTIVE - zr))
    })
  )
  return Math.min(1, 0.5 / reach)
}

/** The copy cube at `deg`, at its scale there: the next episode's face rises from the right. */
const copyAt = (deg: number): string =>
  `transform: translateZ(calc(-1 * var(--depth))) scale(${num(copyScaleAt(deg))}) rotateY(${num(deg)}deg);`

/** The copy cube's angle at `face`. */
const faceDeg = (face: number): number => (-360 * face) / COPY_FACES

/** An ease in and out, as CSS's `ease-in-out` draws it near enough. */
const easeInOut = (t: number): number => t * t * (3 - 2 * t)

/** Seconds the copy block takes to turn to episode `k` of `n`: a quarter's time a quarter. */
export function copyTurnS(k: number, n: number): number {
  return QUARTER_TURN_S * (copyFaceOf(k, n) - copyFromFace(k, n))
}

/**
 * The face the copy cube turns to episode `k` of `n` from: the episode
 * before's, or for the first, the last's a whole turn back, so the cube
 * always turns on.
 */
const copyFromFace = (k: number, n: number): number =>
  k === 0 ? copyFaceOf(n - 1, n) - COPY_FACES : copyFaceOf(k - 1, n)

/** Samples of a turn per quarter turn: its scale is drawn from them. */
const COPY_SAMPLES = 8

/**
 * The copy cube's turn from face `from` to face `to`, beginning at `start`:
 * its angle eased in and out, and its scale at every angle on the way,
 * sampled and drawn straight between.
 */
function copyTurn(
  from: number,
  to: number,
  start: number,
  seconds: number
): ReadonlyArray<Point> {
  const a = faceDeg(from)
  const b = faceDeg(to)
  const steps = Math.max(1, Math.round((Math.abs(b - a) / 90) * COPY_SAMPLES))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return {
      at: start + t * seconds,
      css: copyAt(a + (b - a) * easeInOut(t)),
      ...(i < steps ? { ease: "linear" } : {}),
    }
  })
}

/** A cube's angle for scene `s`: the next face rises from below. */
const cubeAngle = (s: number): string =>
  `transform: translateZ(calc(-1 * var(--depth))) rotateX(${num(90 * s)}deg);`

/**
 * The show's tracks. Each element's name is `s-` and a running number, so a
 * track's keyframes are its own and nothing else can name them.
 */
export function showTimeline(
  episodes: ReadonlyArray<ResolvedEpisode>
): Timeline {
  let next = 0
  const name = (): string => `s-${String(next++)}`
  // First every time, then every track over the cycle those times make.
  type SceneTimes = {
    readonly start: number
    readonly lines: ReadonlyArray<readonly [number, number]>
    readonly arrive: number
    readonly end: number
  }
  type EpisodeTimes = {
    readonly start: number
    /** The copy block's turn to the episode, in seconds. */
    readonly turn: number
    readonly scenes: ReadonlyArray<SceneTimes>
    readonly end: number
  }
  const n = episodes.length
  let at = 0
  const times: Array<EpisodeTimes> = episodes.map((episode, k) => {
    const start = at
    const turn = copyTurnS(k, n)
    at += turn
    const scenes = timedScenes(episode).map((scene): SceneTimes => {
      const sceneStart = at
      let cursor = sceneStart + TITLE_S
      const lines = scene.narration.map((line): readonly [number, number] => {
        const from = cursor
        cursor += chars(line) / STREAM_CPS
        return [from, cursor]
      })
      const arrive = cursor + TURN_S
      at = arrive + HOLD_S
      return { start: sceneStart, lines, arrive, end: at }
    })
    return { start, turn, scenes, end: at }
  })
  const cycleS = at

  const copyName = name()
  const copy: Track = {
    name: copyName,
    keyframes: keyframes(
      copyName,
      cycleS,
      // Always turning on: the first episode comes round again from past
      // the last, through any blank face between them.
      times.flatMap((e, k) =>
        copyTurn(copyFromFace(k, n), copyFaceOf(k, n), e.start, e.turn)
      )
    ),
  }

  const episodeTracks = times.map((e, k): EpisodeTracks => {
    const first = e.scenes.at(0)
    const pairName = name()
    // In view from when the first scene's copy has landed, out as the next
    // episode's copy turns in: the last episode's, as the cycle begins again.
    const enters = first === undefined ? e.start : first.arrive - TURN_S
    const isLast = k === n - 1
    // The next episode's turn takes this pair away, half way through; the
    // first episode's, as the cycle begins again, the last pair.
    const leave = times[(k + 1) % n]?.turn ?? QUARTER_TURN_S
    const gone = leave / 2
    const leaving: ReadonlyArray<Point> = isLast
      ? [
          { at: 0, css: SHOWN, ease: "ease-in" },
          { at: gone, css: HIDDEN },
        ]
      : [{ at: 0, css: HIDDEN }]
    const pair: Track = {
      name: pairName,
      keyframes: keyframes(pairName, cycleS, [
        ...leaving,
        { at: enters, css: HIDDEN, ease: "ease-out" },
        { at: enters + TURN_S, css: SHOWN },
        ...(isLast
          ? []
          : [
              { at: e.end, css: SHOWN, ease: "ease-in" },
              { at: e.end + gone, css: HIDDEN },
            ]),
      ]),
    }
    // The skeletons come in over the second half of the copy block's turn
    // to the episode, once the last episode's pair has gone (so neither
    // shows through the other), and stand until the pair comes into view
    // over them.
    const skeletonName = name()
    const skeleton: Track = {
      name: skeletonName,
      keyframes: keyframes(skeletonName, cycleS, [
        { at: 0, css: HIDDEN },
        { at: e.start + e.turn / 2, css: HIDDEN, ease: "ease-out" },
        { at: e.start + e.turn, css: SHOWN },
        { at: enters, css: SHOWN, ease: "ease-in" },
        { at: enters + TURN_S, css: HIDDEN },
      ]),
    }
    const cube = (): Track => {
      const cubeName = name()
      return {
        name: cubeName,
        // Back to the first face once out of view, for the next round: the
        // last episode's at the cycle's start, as it fades.
        keyframes: keyframes(cubeName, cycleS, [
          ...(isLast && e.scenes.length > 1
            ? [
                { at: 0, css: cubeAngle(e.scenes.length - 1) },
                { at: gone, css: cubeAngle(e.scenes.length - 1) },
                { at: gone + 0.01, css: cubeAngle(0) },
              ]
            : [{ at: 0, css: cubeAngle(0) }]),
          ...e.scenes.slice(1).flatMap((s, i) => [
            { at: s.arrive - TURN_S, css: cubeAngle(i), ease: "ease-in-out" },
            { at: s.arrive, css: cubeAngle(i + 1) },
          ]),
          ...(!isLast && e.scenes.length > 1
            ? [
                { at: e.end + gone, css: cubeAngle(e.scenes.length - 1) },
                { at: e.end + gone + 0.01, css: cubeAngle(0) },
              ]
            : []),
        ]),
      }
    }
    const cubes: readonly [Track, Track] = [cube(), cube()]
    const scenes = e.scenes.map((s, i): SceneTracks => {
      // The last scene's copy stays through the copy block's whole turn,
      // which leaves its face turned away (90 degrees or more: each
      // episode has a face of its own on the copy cube, copyFaceOf), so
      // its hidden back takes it out of sight: the turning face is never
      // blank. The last episode's stays through the turn that begins the
      // cycle again.
      const isLastScene = i === e.scenes.length - 1
      const wraps = isLast && isLastScene
      const following = e.scenes.at(i + 1)?.start ?? e.end + leave
      const blockName = name()
      const titleName = name()
      const episode = episodes.at(k)
      const scene =
        episode === undefined ? undefined : timedScenes(episode).at(i)
      const titleChars = Math.max(1, chars(scene?.title ?? ""))
      const label = (j: 0 | 1): Track => {
        const labelName = name()
        const labelChars = Math.max(1, chars(scene?.faces[j].label ?? ""))
        return {
          name: labelName,
          // Hidden while its face turns in, then typed.
          keyframes: keyframes(labelName, cycleS, [
            { at: 0, css: WHOLE },
            { at: s.arrive - TURN_S, css: TYPED_NOT },
            {
              at: s.arrive,
              css: TYPED_NOT,
              ease: `steps(${String(labelChars)}, end)`,
            },
            { at: s.arrive + LABEL_S, css: WHOLE },
          ]),
        }
      }
      const next = e.scenes.at(i + 1)
      return {
        on: [
          s.arrive - TURN_S,
          next?.arrive ?? (isLast ? cycleS : e.end) + gone,
        ],
        block: {
          name: blockName,
          keyframes: keyframes(blockName, cycleS, [
            ...(wraps
              ? [
                  { at: 0, css: SHOWN },
                  { at: leave, css: HIDDEN },
                ]
              : [{ at: 0, css: HIDDEN }]),
            { at: s.start, css: SHOWN },
            ...(wraps ? [] : [{ at: following, css: HIDDEN }]),
          ]),
        },
        title: {
          name: titleName,
          // Whole outside its scene (where its block hides it), so a scene
          // still shown into the next turn stays whole.
          keyframes: keyframes(titleName, cycleS, [
            {
              at: s.start,
              css: TYPED_NOT,
              ease: `steps(${String(titleChars)}, end)`,
            },
            { at: s.start + TITLE_S, css: WHOLE },
          ]),
        },
        lines: s.lines.map(([from, to]) => {
          const lineName = name()
          return {
            name: lineName,
            // Whole outside its scene, as the title is.
            keyframes: keyframes(lineName, cycleS, [
              { at: s.start, css: WIPED },
              { at: from, css: WIPED, ease: "linear" },
              { at: to, css: WHOLE },
            ]),
          }
        }),
        labels: [label(0), label(1)],
      }
    })
    const plates = platesOf(
      scenes.map((scene) => scene.on[0]),
      cycleS,
      name
    )
    return { start: e.start, skeleton, pair, cubes, scenes, plates }
  })
  return {
    cycleS,
    openS: times[0]?.turn ?? QUARTER_TURN_S,
    copy,
    episodes: episodeTracks,
  }
}

/** How long one plate of the dashboard band takes to give way to the next. */
const PLATE_FADE_S = 0.6

/**
 * The dashboard band's plates for places whose faces come into view at
 * `starts` (seconds into the cycle): each shown from its start to the
 * next's, the last held round the cycle to the first's, with the first
 * shown instead on the page's first round (`PlateTracks`).
 */
function platesOf(
  starts: ReadonlyArray<number>,
  cycleS: number,
  name: () => string
): ReadonlyArray<PlateTracks> {
  const first = starts.at(0) ?? 0
  const fadeIn = (at: number): ReadonlyArray<Point> => [
    { at, css: HIDDEN, ease: "ease-out" },
    { at: at + PLATE_FADE_S, css: SHOWN },
  ]
  const fadeOut = (at: number): ReadonlyArray<Point> => [
    { at, css: SHOWN, ease: "ease-in" },
    { at: at + PLATE_FADE_S, css: HIDDEN },
  ]
  const held = (css: string): Track => {
    const introName = name()
    return {
      name: introName,
      keyframes: `@keyframes ${introName} { from { ${css} } to { ${css} } }`,
    }
  }
  return starts.map((at, i) => {
    const loopName = name()
    const next = starts.at(i + 1)
    const only = starts.length === 1
    const points: ReadonlyArray<Point> = only
      ? [{ at: 0, css: SHOWN }]
      : next === undefined
        ? [{ at: 0, css: SHOWN }, ...fadeOut(first), ...fadeIn(at)]
        : [{ at: 0, css: HIDDEN }, ...fadeIn(at), ...fadeOut(next)]
    return {
      loop: { name: loopName, keyframes: keyframes(loopName, cycleS, points) },
      intro: only
        ? null
        : i === 0
          ? held(SHOWN)
          : next === undefined
            ? held(HIDDEN)
            : null,
      introS: first,
    }
  })
}

/** Every track of a timeline, in order. */
export function tracksOf(timeline: Timeline): ReadonlyArray<Track> {
  return [
    timeline.copy,
    ...timeline.episodes.flatMap((e) => [
      e.skeleton,
      e.pair,
      ...e.cubes,
      ...e.scenes.flatMap((s) => [s.block, s.title, ...s.lines, ...s.labels]),
    ]),
  ]
}

/**
 * Whether a stage face whose scene is up over `on` ("from to", seconds, as
 * `SceneTracks.on` is written into the page) is up at `t` seconds into a
 * cycle of `cycle`: an end past the cycle's reaches into the next round.
 */
export function faceOn(on: string, t: number, cycle: number): boolean {
  const [from = Number.NaN, to = Number.NaN] = on.split(" ").map(Number)
  return (t >= from && t < to) || (t + cycle >= from && t + cycle < to)
}
