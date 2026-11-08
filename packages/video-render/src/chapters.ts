/**
 * An episode's chapters (SFEED4, #2763; SFEED epic #2670, decision 4): each
 * section the template marks, and for the call each ask on its own, so an
 * episode can be heard again a part at a time. They are made from where the
 * renderer put each scene (`shot-times.json`) and go into the upload's
 * YouTube description as its chapter lines.
 *
 * YouTube shows chapters only when the first starts at 0:00, there are at
 * least three, and each lasts at least ten seconds; `chaptersOf` keeps those
 * rules, so what it gives is either shown whole or is empty.
 */

import type { ShotTime } from "./timing"

/** A scene that opens a chapter, and the chapter's title. */
export type ChapterMark = { readonly scene: string; readonly title: string }

export type Chapter = { readonly startMs: number; readonly title: string }

/** What the chapter before the first mark is called. */
export const OPENING = "Opening"

const SHORTEST_MS = 10_000
const FEWEST = 3

/** Every chapter slide among `scenes` (`chapter-<id>`), titled as it is said. */
export const chapterSlides = (
  scenes: ReadonlyArray<{ readonly id: string; readonly said: string }>
): Array<ChapterMark> =>
  scenes
    .filter((scene) => scene.id.startsWith("chapter-"))
    .map((scene) => ({
      scene: scene.id,
      title: scene.said.replace(/[.\s]+$/, ""),
    }))

/**
 * The chapters of a render: an opening at 0:00, then one at the start of
 * each marked scene, in the order placed. A chapter shorter than ten seconds
 * gives its start to the next (a chapter slide and the ask after it are one
 * chapter, from the slide), and a last one that short joins the one before.
 * Fewer than three is none, as YouTube shows none.
 */
export function chaptersOf(
  times: ReadonlyArray<ShotTime>,
  marks: ReadonlyArray<ChapterMark>
): ReadonlyArray<Chapter> {
  const titles = new Map(marks.map((mark) => [mark.scene, mark.title]))
  const end = Math.max(0, ...times.map((t) => t.startMs + t.durationMs))
  const starts: Array<Chapter> = [{ startMs: 0, title: OPENING }]
  for (const time of [...times].sort((a, b) => a.startMs - b.startMs)) {
    const title = titles.get(time.id)
    if (title !== undefined) starts.push({ startMs: time.startMs, title })
  }
  const kept: Array<Chapter> = []
  for (const chapter of starts) {
    const before = kept.at(-1)
    if (before !== undefined && chapter.startMs - before.startMs < SHORTEST_MS)
      kept[kept.length - 1] = { startMs: before.startMs, title: chapter.title }
    else kept.push(chapter)
  }
  const last = kept.at(-1)
  if (kept.length > 1 && last !== undefined && end - last.startMs < SHORTEST_MS)
    kept.pop()
  return kept.length >= FEWEST && kept[0]?.startMs === 0 ? kept : []
}

/** `ms` as a chapter line's time: `m:ss`, or `h:mm:ss` from an hour on. */
export function stamp(ms: number): string {
  const total = Math.floor(ms / 1000)
  const s = String(total % 60).padStart(2, "0")
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, "0")}:${s}`
    : `${String(m)}:${s}`
}

/** The chapters as a YouTube description's lines, one per chapter. */
export const chapterLines = (chapters: ReadonlyArray<Chapter>): string =>
  chapters.map((c) => `${stamp(c.startMs)} ${c.title}\n`).join("")
