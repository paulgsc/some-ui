/**
 * An app's walkthrough (WALK4, #3282): the promo with chapters. One walk,
 * cut into stops on the journey, each opened by a chapter card, then the
 * walk's screens for that stop in the promo's own feature scene, a caption
 * each; the promo's opening before and its close after. The owner approved
 * the shape on the prototype (2026-11-21): the phone at three-quarter size
 * with the caption below it (`promo-feature`'s fit).
 *
 * Voiced (WALK5, #3337): each stop says its screens' captions, a line a
 * screen, and each chapter card says what real use shows of its stop (its
 * friction, home's aggregate: `@some-ui/video-render`'s `friction.ts`),
 * burned in on the card too. Every voiced shot carries the cards essays'
 * `spoken`, in its `walk` case (C830): home's Kokoro says each line
 * (`walkthroughLines`), and `voicedWalkthrough` holds each screen for at
 * least its line and a breath, the taps at the same offsets into it. Before
 * the close, a card names the modules nobody opens (#3338).
 *
 * Same family as the promo (`./promo`): the same scenes, palette, sound kit
 * and series, and the walk's own `walk.json`. A walkthrough is the promo's
 * cut list with chapters, never a second pipeline.
 */

import type { Silent } from "@some-ui/engagement"
import { PIPELINES, silentModules } from "@some-ui/engagement"
import {
  CARDS_VOICES,
  CHAPTER_GAP_MS,
  FEED_SPEAKER,
  laidTake,
  PROMO_SHAPE,
  TAIL_MS,
  VOICE_IN_MS,
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
import {
  frictionNotes,
  frictionSaid,
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
          /** The place in the registry whose friction this stop says; none: not measured. */
          place: z
            .strictObject({
              pipeline: slug,
              affordance: slug,
              place: slug,
            })
            .optional(),
        })
      )
      .min(1),
    cta: drawn(fill.cta),
    badges: z.tuple([drawn(fill.badge), drawn(fill.badge)]),
  }),
})
export type Walkthrough = z.infer<typeof WalkthroughSchema>

/** Every reason `words` can't be drawn over `walk`. */
export function walkthroughProblems(
  words: Walkthrough,
  walk: WalkFile
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

/** A caption as it is said: its drawn lines run together. */
const saidOf = (caption: string): string =>
  caption
    .split("|")
    .map((part) => part.trim())
    .join(" ")

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

/** The silent modules' names and how long each has been quiet, from home's aggregate. */
function silentOf(friction: Friction): {
  readonly silent: ReadonlyArray<Silent & { readonly name: string }>
  readonly notMeasured: number
} {
  const names = new Map(PIPELINES.map((p) => [p.id, p.name]))
  return {
    silent: silentModules(friction.modules).map((s) => ({
      ...s,
      name: names.get(s.pipeline) ?? s.pipeline,
    })),
    notMeasured: friction.modules.filter(
      (m) => m.opened.kind === "not-measured"
    ).length,
  }
}

type Shot = CutList["shots"][number]

/**
 * The walkthrough as a cut list: the opening; for each stop, a card (with
 * what real use shows of it, where `friction` is given) and its screens,
 * each said; a card naming the silent modules (with `friction`); the close.
 *
 * Each line said is `walkthroughLines`' file. With every line of a shot in
 * `takes`, by its file, the shot is voiced: its lines laid on one take
 * (`laid`, which the recorder joins into `<shot>.wav`), a stop's screens
 * each held for its line and a breath (`retimed`), a card for its line. A
 * shot with a line not in `takes` stays silent, as first cut.
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
  /** `shot` saying `lines`, voiced from `startsMs` where its takes are in. */
  const said = (
    shot: Shot,
    lines: ReadonlyArray<string>,
    lay: (heard: ReadonlyArray<StillTake>) => {
      readonly startsMs: ReadonlyArray<number>
      readonly shot: Shot
    }
  ): Shot => {
    const spoken = { role: "walk" as const, lines: [...lines] }
    const own = heard(shot.id, lines.length)
    if (own === null) return { ...shot, spoken }
    const { startsMs, shot: held } = lay(own)
    const take = laidTake(own, startsMs)
    laid.push({
      file: `${shot.id}.wav`,
      lines: startsMs.map((atMs, k) => ({
        file: `${lineFile(shot.id, k)}.wav`,
        atMs,
      })),
    })
    return {
      ...held,
      spoken,
      take: {
        file: `${shot.id}.wav`,
        inMs: 0,
        outMs: take.ms,
        ...(take.words ? { words: [...take.words] } : {}),
      },
      speaker: FEED_SPEAKER,
    }
  }
  /** A card held for its base length, or its one line and a beat either side. */
  const card = (shot: Shot, line: string | null): Shot =>
    line === null
      ? shot
      : said(shot, [line], ([take]) => ({
          startsMs: [0],
          shot: {
            ...shot,
            voiceInMs: VOICE_IN_MS,
            durationMs: Math.max(
              shot.durationMs,
              VOICE_IN_MS + (take?.ms ?? 0) + TAIL_MS
            ),
          },
        }))
  const walkStartMs = Math.round(feature.before * 1000)
  const stops = chapters.flatMap((chapter, i) => {
    const to = chapters[i + 1]?.from ?? walk.snips.length
    const n = String(i + 1)
    const place = friction === null ? null : frictionOf(friction, chapter.place)
    const own = captions.slice(chapter.from, to)
    const slice = walkSlice(walk, chapter.from, to)
    const stop = (w: WalkFile): Shot => ({
      ...featureShot(
        palette,
        `stop-${n}`,
        { appName: appNameOf(words.fill.title), version },
        w,
        own
      ),
      voiceInMs: walkStartMs,
    })
    return [
      card(
        compositionShot(
          palette,
          `chapter-${n}`,
          "walk-chapter",
          place === null ? CHAPTER.seconds : CHAPTER.withNotes,
          {
            number: n,
            title: chapter.title,
            notes: place === null ? "" : frictionNotes(place),
          },
          () => []
        ),
        place === null ? null : frictionSaid(place)
      ),
      said(stop(slice), own.map(saidOf), (heardLines) => {
        const w = retimed(
          slice,
          heardLines.map((t) => t.ms + BREATH_MS)
        )
        return { startsMs: w.snips.map((s) => s.atMs), shot: stop(w) }
      }),
    ]
  })
  const quiet = friction === null ? null : silentOf(friction)
  const silence =
    quiet === null
      ? []
      : [
          card(
            compositionShot(
              palette,
              "silence",
              "walk-chapter",
              CHAPTER.withNotes,
              {
                number: "",
                title: WALKTHROUGH_WORDS.silence.title,
                notes: silenceNotes(quiet.silent, quiet.notMeasured),
              },
              () => []
            ),
            silenceSaid(quiet.silent, quiet.notMeasured)
          ),
        ]
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

/** What home's aggregate holds for `place`: its counts, or "not measured" when the stop names none. */
export type StopFriction =
  | { readonly kind: "measured"; readonly counts: Friction["places"][number] }
  | { readonly kind: "not-measured" }

function frictionOf(
  friction: Friction,
  place: Walkthrough["fill"]["chapters"][number]["place"]
): StopFriction {
  const counts =
    place === undefined
      ? undefined
      : friction.places.find(
          (p) =>
            p.pipeline === place.pipeline &&
            p.affordance === place.affordance &&
            p.place === place.place
        )
  return counts === undefined
    ? { kind: "not-measured" }
    : { kind: "measured", counts }
}

/** The walkthrough as first cut, before anything is said: `voicedWalkthrough` with no takes. */
export const walkthroughCutList = (
  words: Walkthrough,
  walk: WalkFile,
  friction: Friction | null = null
): CutList => voicedWalkthrough(words, walk, friction).cut
