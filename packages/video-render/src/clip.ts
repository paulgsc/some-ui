/**
 * Clips (SFEED7 #2768, epic #2670 decision 5): what a user-facing change
 * built, as a user sees it, kept in paulgsc/testing's `clips/` (decision 9)
 * and listed in `clips/index.json`, which Studio's Library reads.
 *
 * A clip has an `after`, and a `before` when there was a screen to change.
 * Each side is its screens in order, as stills with a label each:
 *
 * - `made: "walk"`: code recorded them, `@some-ui/video-motion`'s
 *   `motion walk` replaying a scripted walk in a sandbox holding only sample
 *   data. The side is that command's own folder, `clips/<id>/<side>/`: its
 *   `walk.json` (`some-ui.walk/1`, whose shape `WalkFileSchema` below reads)
 *   beside its snips, which is a HyperFrames scene's input as it stands.
 * - `made: "session"`: the session that landed the change took them, from
 *   sample data, where there is no walk yet.
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

const SideSchema = z.strictObject({
  made: z.enum(["walk", "session"]),
  snips: z.array(SnipSchema).min(1),
})

export type ClipSide = z.infer<typeof SideSchema>

const ClipSchema = z.strictObject({
  id: showId,
  /** What a user sees it do, in their terms. */
  title: words,
  /** The app or surface it shows: "suspender-ledger", "studio". */
  app: showId,
  change: RefSchema.extend({ kind: z.literal("pr") }),
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
  snips: z.array(z.object({ file: z.string(), label: z.string().trim() })),
})

/**
 * Every reason a `clips/` folder can't be published: its index unread, a
 * walk whose `walk.json` is missing or lists other snips than the index, and
 * a snip the index names that isn't there. `read` gives a JSON file under
 * `clips/` (undefined when it's missing or isn't JSON); `exists` says whether
 * any file is there.
 */
export function clipFolderProblems(
  read: (path: string) => unknown,
  exists: (path: string) => boolean
): Array<string> {
  const index = parseClipIndex(read("index.json"))
  if (!index.ok) return index.problems.map((p) => `index.json: ${p}`)
  const problems: Array<string> = []
  for (const clip of index.value.clips) {
    for (const side of ["before", "after"] as const) {
      const it = clip[side]
      if (it === null) continue
      for (const snip of it.snips)
        if (!exists(clipPath(clip.id, snip.file)))
          problems.push(`${clip.id}: ${snip.file} isn't there`)
      if (it.made === "session") continue
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
