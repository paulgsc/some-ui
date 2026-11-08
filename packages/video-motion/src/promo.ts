/** The release promo's template (HYPER3, #2726): the README says what it is. */

import { CUT_LIST_SCHEMA } from "@some-ui/video-render"
import type { CutList } from "@some-ui/video-render"
import { z } from "zod"

import type { WalkFile } from "./walk/run"

const PROMO_SCHEMA = "some-ui.promo/1"

/**
 * Lines a scene draws, split on "|": at most `lines` of at most `chars`
 * characters each, so every one fits its place in the frame.
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

/** What Claude writes for one release: the words, nothing else. */
const FillSchema = z.strictObject({
  /** The app's name, as the opening sets it. */
  title: drawn(2, 10),
  /** One caption per step of the walk, saying what that screen shows. */
  captions: z.array(drawn(2, 24)).min(1),
  /** Where to get it. */
  cta: drawn(2, 18),
  badges: z.tuple([drawn(1, 18), drawn(1, 18)]),
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
const HOOK_SECONDS = 3.2
const CLOSE_SECONDS = 4
/** Before the walk's first screen, and after its last, in the feature. */
const WALK_START = 0.8
const WALK_TAIL = 0.6

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
    overrides: {},
    burnIns: [],
    idea: { origin: "agent" },
  })
  return {
    schema: CUT_LIST_SCHEMA,
    title: `${release.app} ${release.version}`,
    series: { id: "vertical", version: 1 },
    look: "plain",
    voice: "ad-lib",
    shots: [
      scene("hook", HOOK_SECONDS, {
        title: release.fill.title,
        stage: release.stage,
        platform: release.platform,
        version,
      }),
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
        walk.snips.map((s) => s.file)
      ),
      scene("close", CLOSE_SECONDS, {
        cta: release.fill.cta,
        badge1: release.fill.badges[0],
        badge2: release.fill.badges[1],
      }),
    ],
    burnIns: [],
    revisions: [],
    notes: [],
  }
}
