/**
 * A template's preview (SFEED12, #2757): a short video of one template, made
 * by the same pipeline as an episode from the template's sample, so the owner
 * sees a change to a template (its look, captions, music bed, mark) before
 * the week's episode shows it.
 *
 * The template's code makes the whole cut list from its sample, as it makes
 * an episode (`callCutList` over `sampleCallWeek`); `previewOf` cuts it, by
 * code, to the window: the locked intro, the brand intro, the first chapter
 * slide and the section it opens, a second section where it fits, and the
 * brand outro. The fixed slides keep their length; the said scenes share
 * what is left, each trimmed at its end, its take and words with it, never
 * under `PREVIEW_SHOT_LEAST_MS`. The same cut list gives the same preview.
 *
 * A preview is never an episode: its title says so (`PREVIEW_TITLE`), and
 * the scene ids the templates share name what each scene is (`intro`,
 * `brand-in`, `chapter-<section>`, `brand-out`; anything else is a section).
 */

import { parseCutList } from "./cut-list"
import type { CutList, Parsed, Shot } from "./cut-list"

/** How long a preview runs: 15 to 30 seconds (the owner, #2757). */
export const PREVIEW_WINDOW = { leastMs: 15_000, mostMs: 30_000 } as const

/** The shortest a said scene is trimmed to. */
export const PREVIEW_SHOT_LEAST_MS = 3_000

/** The most sections a preview shows. */
export const PREVIEW_SECTIONS_MOST = 2

/** A preview's title: what it previews, and that its words are a sample. */
export const PREVIEW_TITLE = (title: string): string =>
  `Preview, sample data: ${title}`

/** The beat kept after a trimmed take, as a said scene ends. */
const TRIM_TAIL_MS = 300

type Role = "intro" | "brand-in" | "chapter" | "section" | "brand-out"

/** What a scene is, by the id the templates give it. */
function roleOf(id: string): Role {
  if (id === "intro" || id === "brand-in" || id === "brand-out") return id
  return id.startsWith("chapter-") ? "chapter" : "section"
}

/** Whether a scene keeps its length: a brand slide or a chapter's. */
const fixed = (shot: Shot): boolean => {
  const role = roleOf(shot.id)
  return role === "brand-in" || role === "brand-out" || role === "chapter"
}

const sum = (shots: ReadonlyArray<Shot>): number =>
  shots.reduce((total, s) => total + s.durationMs, 0)

/** The scenes a preview shows, in order, before any is trimmed. */
function picked(shots: ReadonlyArray<Shot>): Parsed<ReadonlyArray<Shot>> {
  const intro = shots[0]
  if (intro?.id !== "intro")
    return { ok: false, problems: ["the preview: the cut opens with no intro"] }
  const brandIn = shots.find((s) => s.id === "brand-in")
  const brandOut = shots.find((s) => s.id === "brand-out")
  const firstChapter = shots.findIndex((s) => roleOf(s.id) === "chapter")
  const from =
    firstChapter >= 0
      ? firstChapter
      : shots.findIndex((s) => roleOf(s.id) === "section")
  if (from < 0)
    return { ok: false, problems: ["the preview: the cut has no section"] }
  const chapter = firstChapter >= 0 ? shots[firstChapter] : undefined
  const sections = shots.slice(from).filter((s) => roleOf(s.id) === "section")
  const first = sections[0]
  if (first === undefined)
    return {
      ok: false,
      problems: ["the preview: no section follows the chapter"],
    }
  const head = [
    intro,
    ...(brandIn ? [brandIn] : []),
    ...(chapter ? [chapter] : []),
  ]
  const tail = brandOut ? [brandOut] : []
  const body = [first]
  // A second section only where it fits whole.
  for (const next of sections.slice(1, PREVIEW_SECTIONS_MOST)) {
    if (sum([...head, ...body, next, ...tail]) > PREVIEW_WINDOW.mostMs) break
    body.push(next)
  }
  return { ok: true, value: [...head, ...body, ...tail] }
}

/** `shot` ended at `durationMs`: its take cut with it, and only the words heard before. */
function trimmed(shot: Shot, durationMs: number): Shot {
  if (durationMs >= shot.durationMs) return shot
  const { take, ...rest } = shot
  if (take === undefined) return { ...rest, durationMs }
  const outMs = Math.min(
    take.outMs,
    take.inMs + durationMs - shot.voiceInMs - TRIM_TAIL_MS
  )
  if (outMs <= take.inMs) return { ...rest, durationMs }
  return {
    ...rest,
    durationMs,
    take: {
      ...take,
      outMs,
      ...(take.words
        ? { words: take.words.filter((w) => w.endMs <= outMs) }
        : {}),
    },
  }
}

/**
 * The scenes' lengths in the window: the fixed slides as they are, the said
 * scenes scaled down together to what is left, in whole ms, none under
 * `PREVIEW_SHOT_LEAST_MS`.
 */
function fitted(shots: ReadonlyArray<Shot>): ReadonlyArray<Shot> {
  const total = sum(shots)
  if (total <= PREVIEW_WINDOW.mostMs) return shots
  const said = shots.filter((s) => !fixed(s))
  const room = PREVIEW_WINDOW.mostMs - sum(shots.filter(fixed))
  const scale = room / sum(said)
  return shots.map((s) =>
    fixed(s)
      ? s
      : trimmed(
          s,
          Math.max(PREVIEW_SHOT_LEAST_MS, Math.floor(s.durationMs * scale))
        )
  )
}

/**
 * `cut`, a template's whole cut list made from its sample, as its preview:
 * `PREVIEW_WINDOW` long, or every reason it can't be.
 */
export function previewOf(cut: CutList): Parsed<CutList> {
  const shots = picked(cut.shots)
  if (!shots.ok) return shots
  const fit = fitted(shots.value)
  const ms = sum(fit)
  if (ms < PREVIEW_WINDOW.leastMs || ms > PREVIEW_WINDOW.mostMs)
    return {
      ok: false,
      problems: [
        `the preview: it runs ${String(ms)} ms, outside ${String(PREVIEW_WINDOW.leastMs)}–${String(PREVIEW_WINDOW.mostMs)}`,
      ],
    }
  return parseCutList({
    ...cut,
    title: PREVIEW_TITLE(cut.title),
    shots: fit,
    revisions: [],
    notes: [],
  })
}
