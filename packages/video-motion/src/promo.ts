/** The release promo's template (HYPER3, #2726): the README says what it is. */

import { CUT_LIST_SCHEMA, PROMO_SHAPE } from "@some-ui/video-render"
import type { CutList, PromoWords, SoundCue } from "@some-ui/video-render"
import { z } from "zod"

import type { WalkFile } from "./walk/run"

const PROMO_SCHEMA = "some-ui.promo/1"

/**
 * Lines a scene draws, split on "|": at most `lines` of at most `chars`
 * characters each. The count keeps the words to their place; the width is
 * fitted where they're drawn (`fit` in compositions/_lib/motion.js), since
 * only the font knows it.
 */
const drawn = (lines: number, chars: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (s) => {
        const parts = s.split("|")
        return (
          parts.length <= lines &&
          parts.every((p) => p.trim().length > 0 && p.length <= chars)
        )
      },
      { message: `at most ${lines} lines of at most ${chars} characters` }
    )

const colour = z.string().regex(/^#[0-9a-f]{6}$/)

const { fill } = PROMO_SHAPE
const words = ({ lines, chars }: PromoWords): z.ZodString => drawn(lines, chars)

/** What Claude writes for one release: the words, nothing else. */
const FillSchema = z.strictObject({
  /** The app's name, as the opening sets it. */
  title: words(fill.title),
  /** One caption per step of the walk, saying what that screen shows. */
  captions: z.array(words(fill.caption)).min(1),
  /** Where to get it. */
  cta: words(fill.cta),
  badges: z.tuple([words(fill.badge), words(fill.badge)]),
})

export const ReleaseSchema = z.strictObject({
  schema: z.literal(PROMO_SCHEMA),
  /** The app, by the walk that shows it (`WALKS` in cli.ts). */
  app: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  /** The release: the built app's own version, checked against the walk. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** The facts on the opening's chips. */
  platform: drawn(1, 18),
  stage: drawn(1, 22),
  palette: z
    .strictObject({
      ground: colour,
      ink: colour,
      accent: colour,
      accentInk: colour,
    })
    .optional(),
  fill: FillSchema,
})
export type Release = z.infer<typeof ReleaseSchema>

/** The hook's and the close's lengths; the feature's is the walk's. */
const HOOK_SECONDS = PROMO_SHAPE.hook.seconds
const CLOSE_SECONDS = PROMO_SHAPE.close.seconds
/** Before the walk's first screen, and after its last, in the feature. */
const WALK_START = PROMO_SHAPE.feature.before
const WALK_TAIL = PROMO_SHAPE.feature.after

/**
 * Where each scene's sounds land (HYPER4, the dry run's cue sheet on
 * #2726), each on what its composition moves: the hook's words leave 0.55 s
 * before its end, the feature's frame opens from its start and leaves 0.5 s
 * before its end, and the close's mark comes in from 0.2 s; the ding
 * strikes 0.1 s into that, as the dry run's did, and rings as it settles.
 */
const CUE_AT = {
  hookLeaves: 550,
  frameOpens: 50,
  featureLeaves: 500,
  closeComesIn: 300,
} as const

/** Every reason `release` can't be drawn over `walk`, of its app. */
export function releaseProblems(
  release: Release,
  walk: WalkFile
): ReadonlyArray<string> {
  const problems: Array<string> = []
  if (walk.version !== release.version) {
    problems.push(
      `the walk is of ${walk.app} ${walk.version}, the release is ${release.version}`
    )
  }
  if (release.fill.captions.length !== walk.snips.length) {
    problems.push(
      `the fill has ${String(release.fill.captions.length)} captions for the walk's ${String(walk.snips.length)} screens`
    )
  }
  return problems
}

/** The promo as a cut list: three composition scenes, each cut to the next. */
export function promoCutList(release: Release, walk: WalkFile): CutList {
  const palette = release.palette ?? {}
  const version = `v${release.version}`
  const scene = (
    id: string,
    seconds: number,
    variables: Record<string, unknown>,
    cues: (durationMs: number) => Array<SoundCue>,
    files: Array<string> = []
  ): CutList["shots"][number] => ({
    id,
    picture: {
      kind: "composition",
      ref: `promo-${id}`,
      variables: { ...palette, ...variables },
      files,
    },
    durationMs: Math.round(seconds * 1000),
    voiceInMs: 0,
    overrides: { cues: cues(Math.round(seconds * 1000)) },
    burnIns: [],
    idea: { origin: "agent" },
  })
  return {
    schema: CUT_LIST_SCHEMA,
    title: `${release.app} ${release.version}`,
    // Version 2 names the sound kit, which `motion promo --brand` brings in.
    series: { ...PROMO_SHAPE.series },
    look: "plain",
    voice: "ad-lib",
    shots: [
      scene(
        "hook",
        HOOK_SECONDS,
        {
          title: release.fill.title,
          stage: release.stage,
          platform: release.platform,
          version,
        },
        (ms) => [{ sound: "whoosh", atMs: ms - CUE_AT.hookLeaves }]
      ),
      scene(
        "feature",
        WALK_START + walk.lengthMs / 1000 + WALK_TAIL,
        {
          appName: release.fill.title.split("|").join(" "),
          version,
          walk: JSON.stringify(walk),
          captions: JSON.stringify(release.fill.captions),
          walkStart: WALK_START,
        },
        (ms) => [
          { sound: "pop", atMs: CUE_AT.frameOpens },
          ...walk.taps.map((tap) => ({
            sound: "click" as const,
            atMs: Math.round(WALK_START * 1000 + tap.atMs),
          })),
          { sound: "whoosh", atMs: ms - CUE_AT.featureLeaves },
        ],
        walk.snips.map((s) => s.file)
      ),
      scene(
        "close",
        CLOSE_SECONDS,
        {
          cta: release.fill.cta,
          badge1: release.fill.badges[0],
          badge2: release.fill.badges[1],
        },
        () => [{ sound: "ding", atMs: CUE_AT.closeComesIn }]
      ),
    ],
    burnIns: [],
    revisions: [],
    notes: [],
  }
}
