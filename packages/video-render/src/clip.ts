/**
 * Clips (SFEED7 #2768, epic #2670 decision 5): what a user-facing change built, as
 * a user sees it. Each is kept in paulgsc/testing's `clips/` (decision 9),
 * listed in `clips/index.json`, which Studio's Library on the phone reads to
 * pick from; only some are shown in an episode.
 *
 * A clip has an `after`, and a `before` when there was a screen to change:
 *
 * - **A walk** (`made: "walk"`): code recorded it, a scripted walk replayed in
 *   a sandbox holding only sample data (`@some-ui/video-motion`'s
 *   `motion walk`), once on the build before the change and once after. Each
 *   side is that command's own folder, `clips/<id>/<side>/`, its `walk.json`
 *   (`some-ui.walk/1`) beside its snips, so a side is a HyperFrames scene's
 *   input as it stands (`promo-feature` draws one).
 * - **A recording** (`made: "session"`): what code can't walk yet, made by
 *   the session that landed the change before it ended (the steward skill's
 *   rule), a video file in `clips/<id>/`.
 *
 * The index repeats each walk's snips and labels, so the phone reads one
 * file; `clipFolderProblems` holds it to every `walk.json` it names.
 */

import { z } from "zod"

import { once, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { showId, words } from "./format"
import { RefSchema } from "./refs"

export const CLIP_INDEX_SCHEMA = "some-ui.clip-index/1"
export const WALK_SCHEMA = "some-ui.walk/1"

/** A file in a clip's folder: a plain relative path, never out of it. */
const clipFile = z
  .string()
  .regex(/^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/)

const SnipSchema = z.strictObject({ file: clipFile, label: words })

const SideSchema = z.discriminatedUnion("made", [
  z.strictObject({
    made: z.literal("walk"),
    /** Each step's screen, in order, as the side's `walk.json` lists it. */
    snips: z.array(SnipSchema).min(1),
  }),
  z.strictObject({
    made: z.literal("session"),
    /** The recording, a video in the clip's folder. */
    video: clipFile.regex(/\.(?:webm|mp4)$/),
  }),
])

export type ClipSide = z.infer<typeof SideSchema>

const ClipSchema = z.strictObject({
  /** Its folder under `clips/`. */
  id: showId,
  /** What a user sees it do, in their terms. */
  title: words,
  /** The app or surface it shows: "suspender-ledger", "studio". */
  app: showId,
  /** The pull request that landed what it shows. */
  change: RefSchema.extend({ kind: z.literal("pr") }),
  /** The day that pull request merged. */
  landed: z.iso.date(),
  before: SideSchema.nullable(),
  after: SideSchema,
})

export type Clip = z.infer<typeof ClipSchema>

export const ClipIndexSchema = z
  .strictObject({
    schema: z.literal(CLIP_INDEX_SCHEMA),
    clips: z.array(ClipSchema),
  })
  .refine((i) => new Set(i.clips.map((c) => c.id)).size === i.clips.length, {
    message: "two clips share an id",
    path: ["clips"],
  })

export type ClipIndex = z.infer<typeof ClipIndexSchema>

export function parseClipIndex(raw: unknown): Parsed<ClipIndex> {
  const parsed = ClipIndexSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "clip index") }
}

/** Where a file of clip `id` is, under `clips/`. */
export const clipPath = (id: string, file: string): string => `${id}/${file}`

/** What a walk's `walk.json` says that a clip repeats. */
const WalkFileSchema = z.object({
  schema: z.literal(WALK_SCHEMA),
  snips: z.array(z.object({ file: z.string(), label: z.string() })),
})

/**
 * Every reason a `clips/` folder can't be published: its index unread, a
 * walk whose `walk.json` is missing or lists other snips than the index, and
 * a file the index names that isn't there. `json` is each JSON file by its
 * path under `clips/`; `exists` says whether any file is there.
 */
export function clipFolderProblems(
  json: ReadonlyMap<string, unknown>,
  exists: (path: string) => boolean
): Array<string> {
  const index = parseClipIndex(json.get("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const problems: Array<string> = []
  for (const clip of index.value.clips) {
    for (const side of ["before", "after"] as const) {
      const it = clip[side]
      if (it === null) continue
      if (it.made === "session") {
        if (!exists(clipPath(clip.id, it.video)))
          problems.push(`${clip.id}: its ${side} names ${it.video}, not there`)
        continue
      }
      const walkPath = clipPath(clip.id, `${side}/walk.json`)
      const walk = WalkFileSchema.safeParse(json.get(walkPath))
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
      for (const snip of it.snips)
        if (!exists(clipPath(clip.id, snip.file)))
          problems.push(`${clip.id}: ${snip.file} isn't there`)
    }
  }
  return once(problems)
}
