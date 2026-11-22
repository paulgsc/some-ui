/**
 * The snips desk's core (SNIPS3, #3364; `docs/snips.md`, "What later stories
 * need"): a capture's snips grouped by the part of the app each shows, each
 * with the owner's keep or drop and note, which home keeps by the snip's id.
 * Pure, so every reading is tested before a screen reads it. Its pictures
 * come through Studio's frame reader (`lib/studio-clips`), the one reader
 * of a picture of the app's screen (C865).
 *
 * No screen reads this yet: home serves no capture, picture or mark until
 * the server half of #3364 lands, and a desk that could only say home didn't
 * answer would not do what it appears to do (C948).
 */
import type { SnipRecord, SnipsManifest } from "@some-ui/video-render/snip"
import { SnipsManifestSchema } from "@some-ui/video-render/snip"
import { z } from "zod"

/** The owner's choice on a snip: keep it for an essay, or drop it. */
const MARKS = ["keep", "drop"] as const
export type Mark = (typeof MARKS)[number]

/** Most characters a note holds: a line or two, said once. */
const NOTE_MAX = 500

/**
 * One mark as home keeps it: the snip's id, the choice, a note, and when.
 * Marks are the owner's record, so a new one is added and none is rewritten;
 * the newest by `at` is the one the desk shows ("Never lose the record").
 */
export const SnipMarkSchema = z.object({
  id: z.string().min(1),
  mark: z.enum(MARKS),
  note: z.string().max(NOTE_MAX),
  at: z.iso.datetime(),
})
export type SnipMark = z.infer<typeof SnipMarkSchema>

/** A capture's manifest as home hands it, or `null` for one that doesn't read. */
export function readManifest(value: unknown): SnipsManifest | null {
  const parsed = SnipsManifestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The newest mark of each snip: the latest `at`, the last listed of equals. */
export function latestMarks(
  marks: ReadonlyArray<SnipMark>
): ReadonlyMap<string, SnipMark> {
  const latest = new Map<string, SnipMark>()
  for (const mark of marks) {
    const held = latest.get(mark.id)
    if (held === undefined || Date.parse(mark.at) >= Date.parse(held.at)) {
      latest.set(mark.id, mark)
    }
  }
  return latest
}

/** One snip on the desk, and the owner's newest mark on it, if any. */
type DeskSnip = {
  readonly snip: SnipRecord
  readonly mark: SnipMark | null
}

/** The snips of one part of the app. */
export type DeskModule = {
  readonly module: string
  readonly snips: ReadonlyArray<DeskSnip>
}

const byWords = (a: string, b: string): number =>
  a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b)

/**
 * The desk: a capture's snips grouped by `module`, the modules and each
 * module's snips in a fixed order (by what each shows, then its id), so the
 * same capture always reads the same; each with its newest mark. A mark on
 * a snip this capture doesn't hold is left out.
 */
export function deskOf(
  manifest: SnipsManifest,
  marks: ReadonlyArray<SnipMark>
): ReadonlyArray<DeskModule> {
  const latest = latestMarks(marks)
  const modules = new Map<string, Array<DeskSnip>>()
  for (const snip of manifest.snips) {
    const list = modules.get(snip.module) ?? []
    list.push({ snip, mark: latest.get(snip.id) ?? null })
    modules.set(snip.module, list)
  }
  return [...modules.entries()]
    .sort(([a], [b]) => byWords(a, b))
    .map(([module, snips]) => ({
      module,
      snips: snips.sort(
        (a, b) =>
          byWords(a.snip.shows, b.snip.shows) || byWords(a.snip.id, b.snip.id)
      ),
    }))
}

/** How many of a module's snips the owner has kept, dropped, and not marked. */
export function tally(
  module: DeskModule
): Readonly<Record<Mark | "open", number>> {
  const counts = { keep: 0, drop: 0, open: 0 }
  for (const { mark } of module.snips) counts[mark?.mark ?? "open"] += 1
  return counts
}

/** The desk's words (SNIPS3), in the owner's terms: what is kept where, never how. */
export const SNIPS_DESK_WORDS = {
  title: "Snips",
  kept: "Kept for an essay",
  dropped: "Dropped",
  open: "Not chosen yet",
  keep: "Keep",
  drop: "Drop",
  note: "Note",
  notePlaceholder: "What this shows, or where it goes",
  where:
    "Your marks and notes are kept on home. The pictures come from a capture of the app, made again whenever it's needed.",
  noCapture: "No capture of the app to choose from yet.",
  tally: (counts: Readonly<Record<Mark | "open", number>>): string =>
    `${String(counts.keep)} kept, ${String(counts.drop)} dropped, ${String(counts.open)} not chosen yet`,
} as const
