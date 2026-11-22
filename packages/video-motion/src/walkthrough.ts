/**
 * An app's walkthrough (WALK4, #3282): the promo with chapters. One walk,
 * cut into stops on the journey, each opened by a chapter card, then the
 * walk's screens for that stop in the promo's own feature scene, a caption
 * each; the promo's opening before and its close after. The owner approved
 * the shape on the prototype (2026-11-21): the phone at three-quarter size
 * with the caption below it (`promo-feature`'s fit).
 *
 * Voiced (WALK5, #3337; the owner's call C945): each stop says its own
 * narration, written for it as part promo and part mission (what the screen
 * can't show: why the step exists), then what real use shows of it (its
 * measures: home's friction aggregate, `@some-ui/video-render`'s
 * `friction.ts`), and the last stop names the modules nobody opens (#3338).
 * The captions are never read, and the chapter cards stay silent, carrying
 * the same measures burned in. Every voiced stop carries the cards essays'
 * `spoken`, in its `walk` case (C830): home's Kokoro says each line
 * (`walkthroughLines`), the lines laid back to back a breath apart, and
 * `voicedWalkthrough` stretches the stop's screens by one factor until they
 * hold them all (C1000).
 *
 * Same family as the promo (`./promo`): the same scenes, palette, sound kit
 * and series, and the walk's own `walk.json`. A walkthrough is the promo's
 * cut list with chapters, never a second pipeline.
 */

import { PIPELINES, silentModules } from "@some-ui/engagement"
import {
  CARDS_VOICES,
  CHAPTER_GAP_MS,
  FEED_SPEAKER,
  FRICTION_WINDOW_DAYS,
  laidTake,
  PROMO_SHAPE,
  startsAfter,
} from "@some-ui/video-render"
import type {
  CutList,
  Friction,
  KokoroVoice,
  StillTake,
} from "@some-ui/video-render"
import { z } from "zod"

import {
  appNameOf,
  bookendedCutList,
  compositionShot,
  drawn,
  featureShot,
  PaletteSchema,
} from "./promo"
import type { WalkFile } from "./walk/run"
import type { Quiet } from "./walkthrough-words"
import {
  measureNotes,
  measureSaid,
  silenceNotes,
  silenceSaid,
  WALKTHROUGH_WORDS,
} from "./walkthrough-words"

const WALKTHROUGH_SCHEMA = "some-ui.walkthrough/1"

const { fill, feature } = PROMO_SHAPE

/** How long a chapter card holds (longer with what real use shows on it), and how long its name may be. */
const CHAPTER = {
  seconds: 1.6,
  withNotes: 3.6,
  title: { lines: 2, chars: 14 },
} as const

/** The pause after a line before the next screen: a breath, the cards essays' between two lines. */
export const BREATH_MS = CHAPTER_GAP_MS

/** The Kokoro voice every line of a walkthrough is said in: the cards essays' narrator. */
const WALKTHROUGH_VOICE: KokoroVoice = CARDS_VOICES.narrator

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const WalkthroughSchema = z.strictObject({
  schema: z.literal(WALKTHROUGH_SCHEMA),
  /** The app, by its walk. */
  app: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  platform: drawn(fill.platform),
  stage: drawn(fill.stage),
  palette: PaletteSchema.optional(),
  fill: z.strictObject({
    title: drawn(fill.title),
    /** One per screen of the walk. */
    captions: z.array(drawn(fill.caption)).min(1),
    /** The stops, in order: each from the walk's screen at index `from`. */
    chapters: z
      .array(
        z.strictObject({
          title: drawn(CHAPTER.title),
          from: z.int().min(0),
          /**
           * What this stop says, line by line: part promo, part mission,
           * what the screen can't show (C945). Never the captions.
           */
          narration: z.array(z.string().min(1).max(240)).min(1).max(4),
          /** What real use shows of this stop, from home's aggregate; none: not measured. */
          measures: z
            .array(
              z.discriminatedUnion("kind", [
                z.strictObject({
                  kind: z.literal("place"),
                  pipeline: slug,
                  affordance: slug,
                  place: slug,
                }),
                z.strictObject({ kind: z.literal("debrief") }),
              ])
            )
            .min(1)
            .optional(),
        })
      )
      .min(1),
    cta: drawn(fill.cta),
    badges: z.tuple([drawn(fill.badge), drawn(fill.badge)]),
  }),
})
export type Walkthrough = z.infer<typeof WalkthroughSchema>

/** Every reason `words` can't be drawn over `walk`, saying `friction` where given. */
export function walkthroughProblems(
  words: Walkthrough,
  walk: WalkFile,
  friction: Friction | null = null
): ReadonlyArray<string> {
  const problems: Array<string> = []
  if (words.app !== walk.app) {
    problems.push(`the walk is of ${walk.app}, the words of ${words.app}`)
  }
  if (words.fill.captions.length !== walk.snips.length) {
    problems.push(
      `the fill has ${String(words.fill.captions.length)} captions for the walk's ${String(walk.snips.length)} screens`
    )
  }
  const starts = words.fill.chapters.map((c) => c.from)
  if (starts[0] !== 0) problems.push("the first chapter starts at screen 0")
  starts.forEach((from, i) => {
    if (i > 0 && from <= (starts[i - 1] ?? -1)) {
      problems.push(`chapter ${String(i + 1)} starts after the one before`)
    }
    if (from >= walk.snips.length) {
      problems.push(
        `chapter ${String(i + 1)} starts past the walk's last screen`
      )
    }
  })
  if (friction !== null)
    words.fill.chapters.forEach((chapter, i) => {
      for (const m of chapter.measures ?? [])
        if (m.kind === "place" && placeIn(friction, m) === undefined)
          problems.push(
            `chapter ${String(i + 1)} names ${m.pipeline}/${m.affordance}/${m.place}, which home's aggregate doesn't hold`
          )
    })
  return problems
}

/**
 * The part of `walk` from screen `from` up to screen `to`, on its own
 * timeline from that screen. A tap stays with the screen it lands on, which
 * is the one before the screen it reaches (`TAP_LEAD_MS` in `./walk/run`), so the tap that
 * leads into the next stop is the last of this one.
 */
export function walkSlice(walk: WalkFile, from: number, to: number): WalkFile {
  const snips = walk.snips.slice(from, to)
  const start = snips[0]?.atMs ?? 0
  const end = walk.snips[to]?.atMs ?? walk.lengthMs
  return {
    ...walk,
    snips: snips.map((s) => ({ ...s, atMs: s.atMs - start })),
    taps: walk.taps
      .filter((t) => t.atMs >= start && t.atMs < end)
      .map((t) => ({ ...t, atMs: t.atMs - start })),
    lengthMs: end - start,
  }
}

/** The version a viewer reads: the release, without a build's own suffix. */
const shownVersion = (version: string): string =>
  `v${version.split("+")[0] ?? version}`

/**
 * `walk` with each screen held for at least `atLeastMs[i]`: a screen held
 * longer keeps its own hold. A tap keeps its place against the end of the
 * screen it lands on, so the tap that leads into the next screen still lands
 * `TAP_LEAD_MS` (`./walk/run`) before it, after the line is said (C941).
 */
export function retimed(
  walk: WalkFile,
  atLeastMs: ReadonlyArray<number>
): WalkFile {
  const ends = walk.snips.map(
    (s, i) => walk.snips[i + 1]?.atMs ?? walk.lengthMs
  )
  const starts: Array<number> = []
  const newEnds: Array<number> = []
  let at = 0
  walk.snips.forEach((s, i) => {
    starts.push(at)
    at += Math.max((ends[i] ?? s.atMs) - s.atMs, atLeastMs[i] ?? 0)
    newEnds.push(at)
  })
  const screenOf = (ms: number): number =>
    walk.snips.reduce((last, s, i) => (s.atMs <= ms ? i : last), -1)
  return {
    ...walk,
    snips: walk.snips.map((s, i) => ({ ...s, atMs: starts[i] ?? 0 })),
    taps: walk.taps.map((t) => {
      const i = screenOf(t.atMs)
      const end = ends[i]
      const moved = newEnds[i]
      return end === undefined || moved === undefined
        ? t
        : { ...t, atMs: moved - (end - t.atMs) }
    }),
    lengthMs: at,
  }
}

/** A line a walkthrough says: into `<file>.wav`, in `voice`. */
export type WalkthroughLine = {
  readonly file: string
  readonly said: string
  readonly voice: KokoroVoice
}

/** Where each line of a voiced shot starts in its take, `<file>.wav`: how the recorder lays their audio. */
export type LaidTake = {
  readonly file: string
  readonly lines: ReadonlyArray<{
    readonly file: string
    readonly atMs: number
  }>
}

/** Line `k` of shot `shot`'s, as a file name. */
const lineFile = (shot: string, k: number): string =>
  `${shot}-${String(k + 1).padStart(2, "0")}`

/** Every line `cut` says, shot by shot, in order: what home's Kokoro is asked to say. */
export function walkthroughLines(cut: CutList): Array<WalkthroughLine> {
  return cut.shots.flatMap((shot) =>
    shot.spoken?.role === "walk"
      ? shot.spoken.lines.map((said, k) => ({
          file: lineFile(shot.id, k),
          said,
          voice: WALKTHROUGH_VOICE,
        }))
      : []
  )
}

/** The silent modules' names and how long each has been quiet, and how many can't be told. */
function quietOf(friction: Friction): Quiet {
  const names = new Map(PIPELINES.map((p) => [p.id, p.name]))
  // A module with no open home holds, measured over fewer than the 28 days
  // (its root began sending inside the window), can't be said to be silent
  // or "never" opened: what came before its first day is unknown, so it is
  // said as not measured.
  const unknown = new Set(
    friction.modules.flatMap((m) =>
      m.opened.kind === "measured" &&
      m.opened.weeksQuiet === null &&
      m.opened.of < FRICTION_WINDOW_DAYS
        ? [m.pipeline]
        : []
    )
  )
  const notMeasured =
    friction.modules.filter((m) => m.opened.kind === "not-measured").length +
    unknown.size
  return {
    // Silent is "opened on no day of the last 28" (C942). The owner allows
    // a walkthrough to say how long each has gone unopened, longest first
    // (C937, #3408).
    silent: silentModules(friction.modules)
      .filter((s) => !unknown.has(s.pipeline))
      .map((s) => ({ ...s, name: names.get(s.pipeline) ?? s.pipeline })),
    measured: friction.modules.length - notMeasured,
    notMeasured,
  }
}

type Shot = CutList["shots"][number]

/** `walk`'s screens each held `factor` times as long, the taps with them. */
function stretched(walk: WalkFile, factor: number): WalkFile {
  if (factor <= 1) return walk
  return retimed(
    walk,
    walk.snips.map((s, i) =>
      Math.ceil(((walk.snips[i + 1]?.atMs ?? walk.lengthMs) - s.atMs) * factor)
    )
  )
}

/**
 * The walkthrough as a cut list: the opening; for each stop, a silent card
 * (with what real use shows of it burned in, where `friction` is given) and
 * its screens, saying its narration, then what real use shows of it; with
 * `friction`, the last stop also names the silent modules, and a card shows
 * them; the close.
 *
 * Each line said is `walkthroughLines`' file. With every line of a stop in
 * `takes`, by its file, the stop is voiced: its lines laid back to back, a
 * breath apart, on one take (`laid`, which the recorder joins into
 * `<shot>.wav`), and its screens stretched by one factor until they hold
 * the lines and a breath (C1000). A stop with a line not in `takes` stays
 * silent, as first cut.
 */
export function voicedWalkthrough(
  words: Walkthrough,
  walk: WalkFile,
  friction: Friction | null,
  takes: ReadonlyMap<string, StillTake> = new Map()
): { readonly cut: CutList; readonly laid: ReadonlyArray<LaidTake> } {
  const palette = words.palette ?? {}
  const version = shownVersion(walk.version)
  const { chapters, captions } = words.fill
  const laid: Array<LaidTake> = []
  const heard = (shot: string, n: number): Array<StillTake> | null => {
    const got = Array.from({ length: n }, (_, k) =>
      takes.get(lineFile(shot, k))
    )
    return got.every((t) => t !== undefined) ? got : null
  }
  const quiet = friction === null ? null : quietOf(friction)
  const walkStartMs = Math.round(feature.before * 1000)
  const card = (n: string, title: string, notes: string): Shot =>
    compositionShot(
      palette,
      n === "" ? "silence" : `chapter-${n}`,
      "walk-chapter",
      notes === "" ? CHAPTER.seconds : CHAPTER.withNotes,
      { number: n, title, notes },
      () => []
    )
  const stops = chapters.flatMap((chapter, i) => {
    const to = chapters[i + 1]?.from ?? walk.snips.length
    const n = String(i + 1)
    const id = `stop-${n}`
    const measures =
      friction === null ? [] : measuresOf(friction, chapter.measures)
    const isLast = i === chapters.length - 1
    const lines = [
      ...chapter.narration,
      ...measureSaid(measures, friction?.partial),
      ...(isLast && quiet !== null ? [silenceSaid(quiet)] : []),
    ]
    const own = captions.slice(chapter.from, to)
    const slice = walkSlice(walk, chapter.from, to)
    const stop = (w: WalkFile): Shot => ({
      ...featureShot(
        palette,
        id,
        { appName: appNameOf(words.fill.title), version },
        w,
        own
      ),
      voiceInMs: walkStartMs,
      spoken: { role: "walk", lines },
    })
    const said = heard(id, lines.length)
    let shot = stop(slice)
    if (said !== null) {
      const startsMs = startsAfter(said, BREATH_MS)
      const take = laidTake(said, startsMs)
      laid.push({
        file: `${id}.wav`,
        lines: startsMs.map((atMs, k) => ({
          file: `${lineFile(id, k)}.wav`,
          atMs,
        })),
      })
      shot = {
        ...stop(stretched(slice, (take.ms + BREATH_MS) / slice.lengthMs)),
        take: {
          file: `${id}.wav`,
          inMs: 0,
          outMs: take.ms,
          ...(take.words ? { words: [...take.words] } : {}),
        },
        speaker: FEED_SPEAKER,
      }
    }
    return [
      card(n, chapter.title, measureNotes(measures, friction?.partial)),
      shot,
    ]
  })
  const silence =
    quiet === null
      ? []
      : [card("", WALKTHROUGH_WORDS.silence.title, silenceNotes(quiet))]
  const cut = bookendedCutList(
    `${words.app} walkthrough ${version}`,
    {
      palette,
      version,
      title: words.fill.title,
      stage: words.stage,
      platform: words.platform,
      cta: words.fill.cta,
      badges: words.fill.badges,
    },
    [...stops, ...silence]
  )
  // Said as the cards essays are: read from a script (`voice: "read"`).
  return { cut: { ...cut, voice: "read" }, laid }
}

type Measure = NonNullable<
  Walkthrough["fill"]["chapters"][number]["measures"]
>[number]

/** What home's aggregate holds for a measure of a stop. */
export type StopMeasure =
  | { readonly kind: "place"; readonly counts: Friction["places"][number] }
  | ({ readonly kind: "debrief" } & Friction["debrief"])
  | { readonly kind: "not-measured" }

function placeIn(
  friction: Friction,
  m: Extract<Measure, { kind: "place" }>
): Friction["places"][number] | undefined {
  return friction.places.find(
    (p) =>
      p.pipeline === m.pipeline &&
      p.affordance === m.affordance &&
      p.place === m.place
  )
}

/** Each of a stop's measures as home's aggregate holds it; a stop that names none is not measured. */
function measuresOf(
  friction: Friction,
  measures: ReadonlyArray<Measure> | undefined
): ReadonlyArray<StopMeasure> {
  if (measures === undefined) return [{ kind: "not-measured" }]
  return measures.map((m): StopMeasure => {
    if (m.kind === "debrief") return { kind: "debrief", ...friction.debrief }
    const counts = placeIn(friction, m)
    // `walkthroughProblems` refuses a place the aggregate doesn't hold.
    if (counts === undefined)
      throw new RangeError(
        `${m.pipeline}/${m.affordance}/${m.place} isn't in home's aggregate`
      )
    return { kind: "place", counts }
  })
}

/** The walkthrough as first cut, before anything is said: `voicedWalkthrough` with no takes. */
export const walkthroughCutList = (
  words: Walkthrough,
  walk: WalkFile,
  friction: Friction | null = null
): CutList => voicedWalkthrough(words, walk, friction).cut
