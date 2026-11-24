/**
 * A walk of an app (WALK1, #3282): the screen each scripted step leaves and
 * each tap, on the walk's own timeline, as `@some-ui/video-motion`'s runner
 * writes `walk.json` beside its snips. Kept here, beside the other screens
 * a video shows (`./snip`, `./page`), so the renderer reads the same record
 * the runner writes, and a cards essay can play a walk (#3476).
 *
 * A walk reaches a cards essay as snips and pages do (`docs/snips.md`, "How
 * walks reach home"): Snips Capture uploads `walks-bundle-<run>`, whose
 * `walks.json` (`some-ui.walks/1`) holds each walk that run made with its
 * pictures' sums; home hands the walks an essay names beside it as
 * `<key>.walks/`, `walks.json` (`some-ui.walks-given/1`) and each picture
 * at `<run>/<app>/snips/<NN>.png`. A scene names a walk by its run and app,
 * and the steps it plays (`./cut-list`, `from: "walks"`), and
 * `resolveScreens` plays them in the screen-zoom composition, each screen
 * in turn and a ring on each tap.
 */

import { z } from "zod"

import { WALK_SCHEMA } from "./clip"
import type { Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"
import { COMMIT as COMMIT_HEX, RUN_ID, WALK_APP } from "./snip-id"

export const WALKS_SCHEMA = "some-ui.walks/1"
export const WALKS_GIVEN_SCHEMA = "some-ui.walks-given/1"

/** A step's picture in its walk's folder. */
const STEP_FILE = /^snips\/\d{2,3}\.png$/

/** What a walk leaves beside its snips, as `walk.json` (`some-ui.walk/1`). */
export const WalkFileSchema = z.strictObject({
  schema: z.literal(WALK_SCHEMA),
  app: z.string().min(1),
  version: z.string().min(1),
  viewport: z.strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
    scale: z.number().positive(),
  }),
  /** Each step's screen, from `atMs` until the next one starts. */
  snips: z.array(
    z.strictObject({
      file: z.string().regex(/^snips\/\d+\.png$/),
      label: z.string(),
      atMs: z.number().min(0),
    })
  ),
  /** Each tap: when, and where in the snip before it, in the viewport's units. */
  taps: z.array(
    z.strictObject({
      label: z.string(),
      atMs: z.number(),
      x: z.number(),
      y: z.number(),
    })
  ),
  lengthMs: z.number().min(0),
})
export type WalkFile = z.infer<typeof WalkFileSchema>

/**
 * The part of `walk` from screen `from` up to screen `to`, on its own
 * timeline from that screen. A tap stays with the screen it lands on, which
 * is the one before the screen it reaches (the runner's tap lead), so the
 * tap that leads into the next part is the last of this one.
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

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in hex")

/** One walk of a run, with its pictures' sums. */
const WalkRecordSchema = z
  .strictObject({
    app: z.string().regex(WALK_APP, "a walk's app, a slug"),
    walk: WalkFileSchema,
    pictures: z.array(
      z.strictObject({
        /** `<app>/snips/<NN>.png`, in the bundle and in what home hands. */
        name: z.string().min(1),
        bytes: z.number().int().positive(),
        sha256: SHA256,
      })
    ),
  })
  .superRefine((record, ctx) => {
    if (record.walk.app !== record.app)
      ctx.addIssue({
        code: "custom",
        path: ["walk", "app"],
        message: `the walk is of ${record.walk.app}, not ${record.app}`,
      })
    const named = record.pictures.map((p) => p.name).sort()
    const steps = record.walk.snips.map((s) => `${record.app}/${s.file}`).sort()
    if (
      record.walk.snips.some((s) => !STEP_FILE.test(s.file)) ||
      named.join("\n") !== steps.join("\n")
    )
      ctx.addIssue({
        code: "custom",
        path: ["pictures"],
        message: `the pictures are not the walk's steps, each once`,
      })
  })
export type WalkRecord = z.infer<typeof WalkRecordSchema>

const COMMIT = z.string().regex(COMMIT_HEX, "a commit's 40 hex digits")
const RUN = z.string().regex(RUN_ID, "a capture run's id, in digits")

const appsOnce = (
  walks: ReadonlyArray<{ readonly app: string }>,
  ctx: z.RefinementCtx
): void => {
  const apps = walks.map((w) => w.app)
  if (new Set(apps).size !== apps.length)
    ctx.addIssue({
      code: "custom",
      path: ["walks"],
      message: "a walk is given twice",
    })
}

/** A run's bundle, `walks-bundle-<run>`'s `walks.json`. */
const WalksSchema = z
  .strictObject({
    schema: z.literal(WALKS_SCHEMA),
    commit: COMMIT,
    run: RUN,
    walks: z.array(WalkRecordSchema),
  })
  .superRefine((given, ctx) => appsOnce(given.walks, ctx))
export type Walks = z.infer<typeof WalksSchema>

/** What home hands beside an essay, `<key>.walks/walks.json`: the walks it names, by run. */
const WalksGivenSchema = z
  .strictObject({
    schema: z.literal(WALKS_GIVEN_SCHEMA),
    runs: z.array(
      z
        .strictObject({
          run: RUN,
          commit: COMMIT,
          walks: z.array(WalkRecordSchema),
        })
        .superRefine((given, ctx) => appsOnce(given.walks, ctx))
    ),
  })
  .superRefine((given, ctx) => {
    const runs = given.runs.map((r) => r.run)
    if (new Set(runs).size !== runs.length)
      ctx.addIssue({
        code: "custom",
        path: ["runs"],
        message: "a run is given twice",
      })
  })
export type WalksGiven = z.infer<typeof WalksGivenSchema>

/** `value` read as a run's walks bundle, or each problem with it. */
export function parseWalks(value: unknown): Parsed<Walks> {
  const parsed = WalksSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "walks") }
}

/** `value` read as the walks home handed an essay, or each problem with it. */
export function parseWalksGiven(value: unknown): Parsed<WalksGiven> {
  const parsed = WalksGivenSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "walks") }
}

/** Where a handed walk's picture sits in `<key>.walks/` and the video's folder: `<run>/<app>/snips/<NN>.png`. */
export const walkPicturePath = (run: string, name: string): string =>
  `${run}/${name}`
