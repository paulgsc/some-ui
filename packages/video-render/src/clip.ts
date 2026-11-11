/**
 * Clips (SFEED7 #2768, epic #2670 decision 5): what a user-facing change
 * built, as a user sees it, listed in paulgsc/testing's `clips/index.json`
 * (decision 9), which Studio's Library reads. The frames are kept on home
 * (owner, 2026-11-11): testing holds the index and nothing else, but for
 * the six frames it kept from before its guard (`LEGACY_FRAMES`).
 *
 * A clip has an `after`, and a `before` when there was a screen to change.
 * Each side is its screens in order, as stills with a label each:
 *
 * - `made: "walk"`: code records them, `@some-ui/video-motion`'s
 *   `motion walk` replaying a scripted walk in a sandbox holding only sample
 *   data. The side names the walk's app and its sample (`walk`), and home
 *   replays it to make the frames itself.
 * - `made: "session"`: the session that landed the change took them, from
 *   sample data, where there is no walk yet. They go on its pull request,
 *   and only their labels are kept.
 *
 * `/1`, the index before frames moved home, is still read: its walks name
 * no sample, and `clipFolderProblems` holds them to the `walk.json` beside
 * their snips instead.
 */

import { z } from "zod"

import { once, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { showId, words } from "./format"
import { PrSchema } from "./refs"

export const CLIP_INDEX_SCHEMA = "some-ui.clip-index/2"
export const CLIP_INDEX_SCHEMA_V1 = "some-ui.clip-index/1"

/** Where paulgsc/testing's `main` is served, publicly: every reader of it, the phone's and the desktop stages', starts here. */
export const TESTING_DATA =
  "https://raw.githubusercontent.com/paulgsc/testing/main"
export const WALK_SCHEMA = "some-ui.walk/1"

/** A file in a clip's folder: a plain relative path, never out of it. */
const clipFile = z
  .string()
  .regex(/^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/)

const SnipSchemaV1 = z.strictObject({ file: clipFile, label: words })

const SnipSchema = SnipSchemaV1.extend({
  /** The frame's bytes, as home keeps them, when the index knows them. */
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
})

const SideSchemaV1 = z.strictObject({
  made: z.enum(["walk", "session"]),
  snips: z.array(SnipSchemaV1).min(1),
})

/**
 * What home replays to make a walk's frames: `motion walk <app> --sample
 * <sample>`, the sample a JSON file in the clip's folder.
 */
const WalkSchema = z.strictObject({
  app: showId,
  sample: clipFile.regex(/\.json$/),
})

const SideSchema = z.discriminatedUnion("made", [
  z.strictObject({
    made: z.literal("walk"),
    walk: WalkSchema,
    snips: z.array(SnipSchema).min(1),
  }),
  z.strictObject({
    made: z.literal("session"),
    snips: z.array(SnipSchema).min(1),
  }),
])

export type ClipSide = z.infer<typeof SideSchema> | z.infer<typeof SideSchemaV1>

const clipFields = {
  id: showId,
  /** What a user sees it do, in their terms. */
  title: words,
  /** The app or surface it shows: "suspender-ledger", "studio". */
  app: showId,
  change: PrSchema,
  landed: z.iso.date(),
}

const ClipSchemaV1 = z.strictObject({
  ...clipFields,
  before: SideSchemaV1.nullable(),
  after: SideSchemaV1,
})
const ClipSchema = z.strictObject({
  ...clipFields,
  before: SideSchema.nullable(),
  after: SideSchema,
})

export type Clip = z.infer<typeof ClipSchema> | z.infer<typeof ClipSchemaV1>

const uniqueIds = (i: { clips: ReadonlyArray<{ id: string }> }): boolean =>
  new Set(i.clips.map((c) => c.id)).size === i.clips.length

export const ClipIndexSchema = z
  .discriminatedUnion("schema", [
    z.strictObject({
      schema: z.literal(CLIP_INDEX_SCHEMA),
      clips: z.array(ClipSchema),
    }),
    z.strictObject({
      schema: z.literal(CLIP_INDEX_SCHEMA_V1),
      clips: z.array(ClipSchemaV1),
    }),
  ])
  .refine(uniqueIds, { message: "two clips share an id", path: ["clips"] })

export type ClipIndex = z.infer<typeof ClipIndexSchema>

export function parseClipIndex(raw: unknown): Parsed<ClipIndex> {
  const parsed = ClipIndexSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "clip index") }
}

/**
 * The frames testing kept from before its guard (testing's `LEGACY_MEDIA`),
 * under `clips/`: the only frames it holds, so the only ones `clip-check`
 * still looks for there. No frame joins this list; home keeps the rest.
 */
const LEGACY_FRAMES: ReadonlySet<string> = new Set([
  "rust-essay-recorded/after/01-intro.png",
  "rust-essay-recorded/after/02-answer.png",
  "rust-essay-recorded/after/03-beside.png",
  "studio-release-promo/after/01-templates.png",
  "studio-release-promo/after/02-release-promo.png",
  "studio-release-promo/before/01-templates.png",
])

/** A snip's file name without its folders: home keeps a side's frames by it. */
export const frameName = (file: string): string =>
  file.slice(file.lastIndexOf("/") + 1)

/** Where a file of clip `id` is, under `clips/`. */
export const clipPath = (id: string, file: string): string => `${id}/${file}`

/** What a walk's `walk.json` says that a `/1` clip repeats. */
const WalkFileSchema = z.object({
  schema: z.literal(WALK_SCHEMA),
  snips: z.array(z.object({ file: z.string(), label: z.string().trim() })),
})

/**
 * Every reason a `clips/` folder can't be published: its index unread, a
 * legacy frame (`LEGACY_FRAMES`) the index names that isn't there, a frame
 * kept here that isn't legacy, and for a walk either the sample home replays
 * missing (`/2`) or its `walk.json` missing or listing other snips (`/1`),
 * and two frames of one side with the same name, since home serves them by it.
 * `read` gives a JSON file under `clips/` (undefined when it's missing or
 * isn't JSON); `exists` says whether any file is there.
 */
export function clipFolderProblems(
  read: (path: string) => unknown,
  exists: (path: string) => boolean
): Array<string> {
  const index = parseClipIndex(read("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const v1 = index.value.schema === CLIP_INDEX_SCHEMA_V1
  const problems: Array<string> = []
  for (const clip of index.value.clips) {
    for (const side of ["before", "after"] as const) {
      const it: ClipSide | null = clip[side]
      if (it === null) continue
      const names = it.snips.map((snip) => frameName(snip.file))
      for (const name of once(names.filter((n, i) => names.indexOf(n) !== i)))
        problems.push(
          `${clip.id}: its ${side} has two frames named ${name}, and home keeps them by name`
        )
      for (const snip of it.snips) {
        const path = clipPath(clip.id, snip.file)
        if (LEGACY_FRAMES.has(path) || v1) {
          if (!exists(path))
            problems.push(`${clip.id}: ${snip.file} isn't there`)
        } else if (exists(path))
          problems.push(
            `${clip.id}: ${snip.file} is a frame, and home keeps those`
          )
      }
      if (it.made === "session") continue
      if ("walk" in it) {
        const sample = clipPath(clip.id, it.walk.sample)
        if (read(sample) === undefined)
          problems.push(`${clip.id}: ${sample} isn't a sample home can replay`)
        continue
      }
      const walkPath = clipPath(clip.id, `${side}/walk.json`)
      const walk = WalkFileSchema.safeParse(read(walkPath))
      if (!walk.success) {
        problems.push(`${clip.id}: ${walkPath} isn't a walk`)
        continue
      }
      const listed = walk.data.snips.map((s) => ({
        file: `${side}/${s.file}`,
        label: s.label,
      }))
      if (JSON.stringify(listed) !== JSON.stringify(it.snips))
        problems.push(
          `${clip.id}: its ${side} lists other snips than ${walkPath}`
        )
    }
  }
  return once(problems)
}
