/**
 * A template's preview (SFEED12, #2757): a short video of one template, made
 * by the same pipeline as an episode from the template's sample, so the owner
 * sees a change to a template (its look, captions, music bed, mark) before
 * the week's episode shows it.
 *
 * The template's code makes the whole cut list from its sample, as it makes
 * an episode (`callCutList` over `sampleCallWeek`); `previewOf` cuts it to
 * `PREVIEW_WINDOW`: the locked intro, the brand intro, the first chapter and
 * its sections, as many as fit whole up to `PREVIEW_SECTIONS_MOST`, and the
 * brand outro. Slides keep their length; the said scenes share the rest.
 *
 * A scene's role is read from the ids the call and Playoff Delta give it
 * (`intro`, `brand-in`, `chapter-<section>`, `brand-out`; anything else is a
 * section). No type ties those ids together, so a template that renames one
 * changes what its preview shows.
 */

import { parseCutList } from "./cut-list"
import type { CutList, Parsed, Shot } from "./cut-list"
import { BRAND_MS, TAIL_MS } from "./stills"

/** The owner's window, 15 to 30 seconds (#2757). */
export const PREVIEW_WINDOW = { leastMs: 15_000, mostMs: 30_000 } as const

/** A trimmed scene holds at least as long as a brand slide, long enough to read. */
export const PREVIEW_SHOT_LEAST_MS = BRAND_MS

/** "One or two scenes" (#2757). */
export const PREVIEW_SECTIONS_MOST = 2

/** A preview's title: it is never an episode, and its words are a sample. */
export const PREVIEW_TITLE = (title: string): string =>
  `Preview, sample data: ${title}`

type Role = "intro" | "brand-in" | "chapter" | "section" | "brand-out"

function roleOf(id: string): Role {
  if (id === "intro" || id === "brand-in" || id === "brand-out") return id
  return id.startsWith("chapter-") ? "chapter" : "section"
}

/** A brand slide or a chapter keeps its length. */
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
  const chapterAt = shots.findIndex((s) => roleOf(s.id) === "chapter")
  const from =
    chapterAt >= 0
      ? chapterAt + 1
      : shots.findIndex((s) => roleOf(s.id) === "section")
  // The first chapter's sections: up to the next chapter or the outro.
  const sections: Array<Shot> = []
  for (const shot of from < 0 ? [] : shots.slice(from)) {
    if (roleOf(shot.id) !== "section") break
    sections.push(shot)
  }
  const [first, ...more] = sections
  if (first === undefined)
    return { ok: false, problems: ["the preview: the cut has no section"] }
  const chapter = chapterAt >= 0 ? shots[chapterAt] : undefined
  const head = [
    intro,
    ...(brandIn ? [brandIn] : []),
    ...(chapter ? [chapter] : []),
  ]
  const tail = brandOut ? [brandOut] : []
  const body = [first]
  for (const next of more.slice(0, PREVIEW_SECTIONS_MOST - 1)) {
    if (sum([...head, ...body, next, ...tail]) > PREVIEW_WINDOW.mostMs) break
    body.push(next)
  }
  return { ok: true, value: [...head, ...body, ...tail] }
}

/**
 * `shot` ended at `durationMs`, its take with it: on the last word heard
 * whole where the speaker gave words, so the captions show every word heard.
 */
function trimmed(shot: Shot, durationMs: number): Shot {
  if (durationMs >= shot.durationMs) return shot
  const { take, ...rest } = shot
  if (take === undefined) return { ...rest, durationMs }
  const limit = Math.min(
    take.outMs,
    take.inMs + durationMs - shot.voiceInMs - TAIL_MS
  )
  const words = take.words?.filter((w) => w.endMs <= limit)
  // Timed words, none heard whole: nothing of the take is kept.
  const outMs = take.words?.length ? (words?.at(-1)?.endMs ?? take.inMs) : limit
  if (outMs <= take.inMs) return { ...rest, durationMs }
  return {
    ...rest,
    durationMs,
    take: { ...take, outMs, ...(words ? { words } : {}) },
  }
}

/** The said scenes scaled down together to what the slides leave of the window. */
function fitted(shots: ReadonlyArray<Shot>): ReadonlyArray<Shot> {
  if (sum(shots) <= PREVIEW_WINDOW.mostMs) return shots
  const room = PREVIEW_WINDOW.mostMs - sum(shots.filter(fixed))
  const scale = room / sum(shots.filter((s) => !fixed(s)))
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
 * `cut`, a template's whole cut list made from its sample, as its preview,
 * or every reason it can't be one.
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
