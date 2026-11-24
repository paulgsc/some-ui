/**
 * Our own surfaces are shown, not described (#3476, SHOW1): when a chapter
 * of an essay speaks of a screen we own, the chapter shows a picture of
 * one. The owner (2026-11-24): "when we talk about our own applications, we
 * show them." Public pages are for subjects off our surfaces.
 *
 * What "speaks of" means here is decidable, so it is narrow: a phrase from
 * `SURFACE_PHRASES` in a scene's chapter line or narration, the phrases a
 * line uses to place something on a screen of ours ("arrives on the
 * phone", "watch it in Studio"), or a source citing a file that draws one
 * (`SURFACE_SOURCES`). What a sentence is about is not decidable, so the
 * check misses a surface described in other words, and refuses a chapter
 * that uses a phrase for something else (rephrase the line, or show the
 * screen). The phrases and sources are policy, moved with the story.
 *
 * What "shows" means: a scene in the same chapter whose picture is a
 * `screen` from a source that is ours (`OURS`): a snip of the app or a
 * Clips Library frame. A card, a public page and a spoken card's stage are
 * not.
 */

import type { CutList, Picture, Shot } from "./cut-list"
import { chapterIndexes } from "./voices"

/** What kind of surface of ours a line speaks of. */
export type SurfaceKind = "app"

/** A phrase that places something on a surface of ours. */
type Phrase = { readonly kind: SurfaceKind; readonly says: RegExp }

/**
 * The phrases a line uses to place something on our app: on the phone or
 * the APK, in the web app, in Studio (never YouTube's or Android's). "The
 * app" alone is left out: a line says it of other people's apps too.
 */
const SURFACE_PHRASES: ReadonlyArray<Phrase> = [
  {
    kind: "app",
    says: /\b(?:on|in) (?:the|your|my|our) (?:phone|APK|web app)\b/iu,
  },
  { kind: "app", says: /\bthe (?:phone|APK|web app) shows\b/iu },
  { kind: "app", says: /\b(?:[Ii]n|[Oo]n|[Uu]nder) Studio\b/u },
  { kind: "app", says: /(?<!(?:YouTube|Android) )\bStudio['’]s\b/u },
]

/** A file that draws a surface of ours, by its repository and path. */
type Source = {
  readonly kind: SurfaceKind
  readonly repo: string
  readonly path: RegExp
}

/** The files that draw our app's screens: its routes and its UI packages' components. */
const SURFACE_SOURCES: ReadonlyArray<Source> = [
  {
    kind: "app",
    repo: "paulgsc/some-ui",
    path: /^(?:apps\/www\/src|packages\/ui\/[^/]+\/src)\/(?!.*(?:__tests__\/|\.test\.tsx$)).*\.tsx$/u,
  },
]

/** The screens that show each kind of surface: ours, never a public page. */
const OURS: Readonly<Record<SurfaceKind, ReadonlyArray<string>>> = {
  app: ["snips", "clips"],
}

/** Which kinds of surface a scene's own words and sources speak of. */
export function surfacesSpoken(shot: Shot): ReadonlySet<SurfaceKind> {
  const spoken = shot.spoken
  if (spoken?.role !== "scene") return new Set()
  const words = `${spoken.chapter ?? ""} ${spoken.narration}`
  const kinds = new Set<SurfaceKind>()
  for (const p of SURFACE_PHRASES) if (p.says.test(words)) kinds.add(p.kind)
  for (const s of spoken.sources ?? [])
    for (const known of SURFACE_SOURCES)
      if (s.repo === known.repo && known.path.test(s.path))
        kinds.add(known.kind)
  return kinds
}

/** Whether `picture` shows a surface of kind `kind`. */
const shows = (picture: Picture, kind: SurfaceKind): boolean =>
  picture.kind === "screen" && OURS[kind].includes(picture.of.from)

/**
 * Every chapter of `cut` that speaks of a surface of ours and shows none,
 * as a line naming its first scene that does.
 */
export function unshownProblems(cut: CutList): Array<string> {
  const chapters = chapterIndexes(
    cut.shots.map(
      (s) => s.spoken?.role === "scene" && s.spoken.chapter !== undefined
    )
  )
  const problems: Array<string> = []
  const told = new Set<string>()
  cut.shots.forEach((shot, i) => {
    const chapter = chapters[i]
    for (const kind of surfacesSpoken(shot)) {
      const key = `${String(chapter)}:${kind}`
      if (told.has(key)) continue
      const shown = cut.shots.some(
        (s, j) => chapters[j] === chapter && shows(s.picture, kind)
      )
      if (shown) continue
      told.add(key)
      problems.push(
        `${shot.id}: it speaks of our ${kind} and its chapter shows none: show it as a screen (${OURS[kind].join(" or ")}), not a card (SHOW1)`
      )
    }
  })
  return problems
}
