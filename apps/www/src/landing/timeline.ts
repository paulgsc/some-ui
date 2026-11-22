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
import type { ResolvedEpisode } from "./show.ts"

/** Characters a second the copy streams at. */
export const STREAM_CPS = 38
/** Seconds the scene's title takes to type in before its narration. */
export const TITLE_S = 0.6
/** Seconds the cubes take to turn a face, or to come into view. */
export const TURN_S = 1.2
/** Seconds a scene holds once its faces are shown. */
export const HOLD_S = 4
/** Seconds the copy block takes to turn to the next episode. */
export const EPISODE_TURN_S = 1.4
/** Seconds a band's label takes to type in once its face has arrived. */
const LABEL_S = 0.9

/** One element's moves: its name (its class and its keyframes') and its keyframes. */
export type Track = { readonly name: string; readonly keyframes: string }

type SceneTracks = {
  /** The scene's copy, shown from its start until the next scene's. */
  readonly block: Track
  readonly title: Track
  readonly lines: ReadonlyArray<Track>
  /** Each cube's band label, typed as its face arrives. */
  readonly labels: readonly [Track, Track]
}

type EpisodeTracks = {
  /**
   * Where the episode's pair will be, as skeletons (C1185): standing from
   * the episode's start, giving way as the pair turns in.
   */
  readonly skeleton: Track
  /** The episode's pair of cubes: in view for its episode only. */
  readonly pair: Track
  readonly cubes: readonly [Track, Track]
  readonly scenes: ReadonlyArray<SceneTracks>
}

export type Timeline = {
  /** The whole show, in seconds: every track's one cycle. */
  readonly cycleS: number
  /** The copy block's turn about Y, an episode a face. */
  readonly copy: Track
  readonly episodes: ReadonlyArray<EpisodeTracks>
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

/** The copy block's angle for episode `k` of `n`: the next episode's face rises from the right. */
const copyAngle = (k: number, n: number): string =>
  `transform: translateZ(calc(-1 * var(--depth))) rotateY(${num((-360 * k) / n)}deg);`

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
    readonly scenes: ReadonlyArray<SceneTimes>
    readonly end: number
  }
  let at = 0
  const times: Array<EpisodeTimes> = episodes.map((episode) => {
    const start = at
    at += EPISODE_TURN_S
    const scenes = episode.scenes.map((scene): SceneTimes => {
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
    return { start, scenes, end: at }
  })
  const cycleS = at
  const n = episodes.length

  const copyName = name()
  const copy: Track = {
    name: copyName,
    keyframes: keyframes(
      copyName,
      cycleS,
      times.flatMap((e, k) => [
        { at: e.start, css: copyAngle(k - 1, n), ease: "ease-in-out" },
        { at: e.start + EPISODE_TURN_S, css: copyAngle(k, n) },
      ])
    ),
  }

  const episodeTracks = times.map((e, k): EpisodeTracks => {
    const first = e.scenes.at(0)
    const pairName = name()
    // In view from when the first scene's copy has landed, out as the next
    // episode's copy turns in: the last episode's, as the cycle begins again.
    const enters = first === undefined ? e.start : first.arrive - TURN_S
    const isLast = k === n - 1
    const gone = EPISODE_TURN_S / 2
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
        { at: e.start + gone, css: HIDDEN, ease: "ease-out" },
        { at: e.start + EPISODE_TURN_S, css: SHOWN },
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
      // which leaves its face turned away (120 degrees or more: a show is
      // two or three episodes, one a project, which resolveShow holds), so
      // its hidden back takes it out of sight: the turning face is never
      // blank. The last episode's, through the
      // turn that begins the cycle again.
      const isLastScene = i === e.scenes.length - 1
      const wraps = isLast && isLastScene
      const following = e.scenes.at(i + 1)?.start ?? e.end + EPISODE_TURN_S
      const blockName = name()
      const titleName = name()
      const scene = episodes.at(k)?.scenes.at(i)
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
      return {
        block: {
          name: blockName,
          keyframes: keyframes(blockName, cycleS, [
            ...(wraps
              ? [
                  { at: 0, css: SHOWN },
                  { at: EPISODE_TURN_S, css: HIDDEN },
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
    return { skeleton, pair, cubes, scenes }
  })
  return { cycleS, copy, episodes: episodeTracks }
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
