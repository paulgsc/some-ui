/**
 * An app's walkthrough (WALK4, #3282): the promo with chapters. One walk,
 * cut into stops on the journey, each opened by a chapter card, then the
 * walk's screens for that stop in the promo's own feature scene, a caption
 * each; the promo's opening before and its close after. The owner approved
 * the shape on the prototype (2026-11-21): the phone at three-quarter size
 * with the caption below it (`promo-feature`'s fit), and captions only, no
 * narration.
 *
 * Same family as the promo (`./promo`): the same scenes, palette, sound kit
 * and series, and the walk's own `walk.json`. A walkthrough is the promo's
 * cut list with chapters, never a second pipeline.
 */

import { CUT_LIST_SCHEMA, PROMO_SHAPE } from "@some-ui/video-render"
import type { CutList } from "@some-ui/video-render"
import { z } from "zod"

import {
  compositionShot,
  CUE_AT,
  drawn,
  featureShot,
  PaletteSchema,
} from "./promo"
import type { WalkFile } from "./walk/run"

const WALKTHROUGH_SCHEMA = "some-ui.walkthrough/1"

const { hook, close, fill } = PROMO_SHAPE

/** How long a chapter card holds, and how long its name may be. */
const CHAPTER = {
  seconds: 1.6,
  title: { lines: 2, chars: 14 },
} as const

/** How long before a screen its tap lands (`TAP_LEAD_MS` in `./walk/run`). */
const TAP_LEAD_MS = 400

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
 * timeline from that screen: its taps are those that lead into its screens.
 */
export function walkSlice(walk: WalkFile, from: number, to: number): WalkFile {
  const snips = walk.snips.slice(from, to)
  const start = snips[0]?.atMs ?? 0
  const end = walk.snips[to]?.atMs ?? walk.lengthMs
  return {
    ...walk,
    snips: snips.map((s) => ({ ...s, atMs: s.atMs - start })),
    taps: walk.taps
      .filter(
        (t) => t.atMs + TAP_LEAD_MS >= start && t.atMs + TAP_LEAD_MS < end
      )
      .map((t) => ({ ...t, atMs: t.atMs - start })),
    lengthMs: end - start,
  }
}

/** The version a viewer reads: the release, without a build's own suffix. */
const shownVersion = (version: string): string =>
  `v${version.split("+")[0] ?? version}`

/** The walkthrough as a cut list: the opening, a card and the screens per stop, the close. */
export function walkthroughCutList(
  words: Walkthrough,
  walk: WalkFile
): CutList {
  const palette = words.palette ?? {}
  const version = shownVersion(walk.version)
  const { chapters, captions } = words.fill
  const stops = chapters.flatMap((chapter, i) => {
    const to = chapters[i + 1]?.from ?? walk.snips.length
    const n = String(i + 1)
    return [
      compositionShot(
        palette,
        `chapter-${n}`,
        "walk-chapter",
        CHAPTER.seconds,
        { number: n, title: chapter.title },
        () => []
      ),
      featureShot(
        palette,
        `stop-${n}`,
        { appName: words.fill.title.split("|").join(" "), version },
        walkSlice(walk, chapter.from, to),
        captions.slice(chapter.from, to)
      ),
    ]
  })
  return {
    schema: CUT_LIST_SCHEMA,
    title: `${words.app} walkthrough ${version}`,
    series: { ...PROMO_SHAPE.series },
    look: "plain",
    voice: "ad-lib",
    shots: [
      compositionShot(
        palette,
        "hook",
        "promo-hook",
        hook.seconds,
        {
          title: words.fill.title,
          stage: words.stage,
          platform: words.platform,
          version,
        },
        (ms) => [{ sound: "whoosh", atMs: ms - CUE_AT.hookLeaves }]
      ),
      ...stops,
      compositionShot(
        palette,
        "close",
        "promo-close",
        close.seconds,
        {
          cta: words.fill.cta,
          badge1: words.fill.badges[0],
          badge2: words.fill.badges[1],
        },
        () => [{ sound: "ding", atMs: CUE_AT.closeComesIn }]
      ),
    ],
    burnIns: [],
    revisions: [],
    notes: [],
  }
}
