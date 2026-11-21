/**
 * An episode's thumbnail (EPISODES3 on #3030; C1026, the owner's pick C2a):
 * one still, 1280×720 (YouTube's size), drawn by code, the same bytes for
 * the same inputs. Home makes it beside the episode's video and keeps it;
 * the owner uploads it by hand in YouTube Studio (C1025), and nothing here
 * touches YouTube.
 *
 * Its varying fields are the episode's title and who speaks in it
 * (`ThumbnailVoices`, read from the cut list by `voicesOf`); the genre picks
 * the paint and the shape (`@some-ui/styles/brand/genres`), one family for
 * every feed. The upper area is the genre's shape behind the title; the
 * footer is a band in the genre's hue across the full width, a hard edge
 * the eye finds, which says plainly who speaks: a tin bird for the
 * synthetic voice (home's Kokoro), the mochi where the owner's own voice is
 * in it.
 *
 * The title is fitted, never drawn badly (`chooseTitleSize`): the largest
 * size at which it stays inside its box, and refused when it fits only at a
 * size YouTube's 320×180 list would make unreadable.
 *
 * Pure: `thumbnailPage` is a whole HTML page, fonts embedded, for a browser
 * at 1280×720 and scale 1 to measure and capture (`record`'s thumbnail).
 */

import { castNodes, nodesText } from "@some-ui/styles/brand/cast"
import type { Character } from "@some-ui/styles/brand/cast"
import {
  GENRE_PAINT,
  GENRE_VIEW_BOX,
  genreNodes,
} from "@some-ui/styles/brand/genres"
import type { Genre } from "@some-ui/styles/brand/genres"

import type { CutList, Parsed } from "./cut-list"

/** The still's size, YouTube's, and the list's size it must read at. */
export const THUMBNAIL = {
  width: 1280,
  height: 720,
  /** YouTube's smallest list size, 320×180, as a share of the still. */
  small: 0.25,
  /** The footer band's height: a fifth of the still, so the picture leads. */
  band: 144,
} as const

/** The fewest pixels a line's letters may be at 320×180 and still be read. */
export const LEAST_READABLE_PX = 14

/**
 * The band's two lines, in px at 1280×720. The main line says who speaks
 * and reads at 320×180 (`LEAST_READABLE_PX`); the line under it glosses
 * it, for the full-size view, and may be lost in the small list.
 */
export const BAND_PX = { main: 60, under: 36 } as const

/** The title's box and the sizes it is tried at, largest first. */
export const TITLE_FIT = {
  width: 660,
  height: 420,
  maxPx: 124,
  /** The smallest size that reads at 320×180: `LEAST_READABLE_PX / small`. */
  minPx: LEAST_READABLE_PX / THUMBNAIL.small,
  stepPx: 2,
} as const

/**
 * Who speaks in an episode, as its thumbnail says it: home's synthetic
 * voice, the owner's own, both, or neither.
 */
export type ThumbnailVoices = "synthetic" | "owner" | "both" | "silent"

/** What a thumbnail is drawn from. */
export type ThumbnailInput = {
  readonly genre: Genre
  readonly title: string
  readonly voices: ThumbnailVoices
}

/**
 * Who speaks in `cut`: a take a speech model said (`speaker`) or a spoken
 * card's Kokoro turn is the synthetic voice; a take with no speaker, or a
 * spoken card's owner turn, is the owner's.
 */
export const voicesOf = (cut: CutList): ThumbnailVoices => {
  const turns = cut.shots.flatMap((shot) =>
    shot.spoken?.role === "spoken"
      ? shot.spoken.exchanges.flatMap(({ ask, answer }) => [ask, answer])
      : []
  )
  const synthetic =
    cut.shots.some((shot) => shot.speaker !== undefined) ||
    turns.some((turn) => turn.voice === "kokoro")
  const owner =
    cut.shots.some(
      (shot) => shot.take !== undefined && shot.speaker === undefined
    ) || turns.some((turn) => turn.voice === "owner")
  return synthetic && owner
    ? "both"
    : synthetic
      ? "synthetic"
      : owner
        ? "owner"
        : "silent"
}

/** The sizes the title is tried at, largest first, down to the least readable. */
export const titleSizes = (): ReadonlyArray<number> =>
  Array.from(
    {
      length:
        Math.floor((TITLE_FIT.maxPx - TITLE_FIT.minPx) / TITLE_FIT.stepPx) + 1,
    },
    (_, i) => TITLE_FIT.maxPx - i * TITLE_FIT.stepPx
  )

/** The title's laid-out size at one font size, as the page measured it. */
export type TitleMeasure = {
  readonly px: number
  readonly width: number
  readonly height: number
}

/**
 * The size to draw the title at: the largest of `measured` whose layout
 * stays inside the title's box. Refused when none does, since every size
 * tried is one that reads at 320×180, and a smaller one would not.
 */
export const chooseTitleSize = (
  title: string,
  measured: ReadonlyArray<TitleMeasure>
): Parsed<number> => {
  const fits = measured
    .filter(
      (m) =>
        m.px >= TITLE_FIT.minPx &&
        m.width <= TITLE_FIT.width &&
        m.height <= TITLE_FIT.height
    )
    .sort((a, b) => b.px - a.px)
  const best = fits.at(0)
  return best === undefined
    ? {
        ok: false,
        problems: [
          `The title "${title}" doesn't fit the thumbnail at any size that still reads at 320×180 (${String(TITLE_FIT.minPx)}px or more): shorten it.`,
        ],
      }
    : { ok: true, value: best.px }
}

/**
 * The faces a thumbnail draws in, each a `data:` URL of its woff2: the
 * brand's pinned Barlow Condensed (`@some-ui/video-motion`'s fonts), so no
 * font is reached on the network or the host.
 */
export type ThumbnailFonts = {
  /** Barlow Condensed 800. */
  readonly title: string
  /** Barlow Condensed 600. */
  readonly label: string
}

/** Each genre's name on its thumbnail. */
const GENRE_NAMES: Readonly<Record<Genre, string>> = {
  call: "The weekly call",
  "cards-essay": "Cards essay",
  "interview-essay": "Interview essay",
  "playoff-delta": "Playoff Delta",
  report: "Engagement report",
  "rust-essay": "Rust Rounds",
}

/** What the band says for each case: its main line, and the line under it. */
const BAND_WORDS: Readonly<
  Record<ThumbnailVoices, { readonly main: string; readonly under: string }>
> = {
  synthetic: { main: "Synthetic voice", under: "voiced by a tin bird" },
  both: { main: "Synthetic voice", under: "voiced by a tin bird" },
  owner: { main: "My own voice", under: "no synthetic voice" },
  silent: { main: "No voice", under: "words on screen" },
}

/** The tin bird: the synthetic voice wherever the brand draws one. */
const BIRD: Character = "tin-owlet"

const ink = "#f6efe2"

const escaped = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** A character at `size`, its ground clear and its key light left out. */
const character = (who: Character, size: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${String(size)}" height="${String(size)}">${nodesText(
    castNodes(who, (name) => `${who}-${name}`),
    { ground: "none", glow: false }
  )}</svg>`

/**
 * `input`'s thumbnail as a whole HTML page, its title at `titlePx` (the
 * largest the title box takes: `TITLE_FIT.maxPx` to measure, then
 * `chooseTitleSize`'s). The title's element is `[data-title]`.
 */
export const thumbnailPage = (
  input: ThumbnailInput,
  fonts: ThumbnailFonts,
  titlePx: number = TITLE_FIT.maxPx
): string => {
  const { hue, ground } = GENRE_PAINT[input.genre]
  const words = BAND_WORDS[input.voices]
  const speaks = input.voices === "synthetic" || input.voices === "both"
  const shape = nodesText(genreNodes(input.genre), { ground })
  const cast = [
    ...(speaks ? [character(BIRD, 132)] : []),
    ...(input.voices === "owner" ? [character("mochi", 132)] : []),
  ].join("")
  const plusMe =
    input.voices === "both"
      ? `<div class="me">${character("mochi", 132)}<div class="t big">+ me</div></div>`
      : ""
  const { width, height, band } = THUMBNAIL
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"T";font-weight:800;src:url(${fonts.title}) format("woff2")}
@font-face{font-family:"L";font-weight:600;src:url(${fonts.label}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${String(width)}px;height:${String(height)}px;overflow:hidden;background:${ground}}
.shape{position:absolute;right:-30px;top:6px;width:600px;height:338px;opacity:.55}
.upper{position:absolute;left:64px;width:${String(TITLE_FIT.width)}px;top:44px;bottom:${String(band + 40)}px;display:flex;flex-direction:column;justify-content:flex-end;gap:16px}
.genre{font:600 38px/1 "L";letter-spacing:.06em;text-transform:uppercase;color:${hue}}
.title{font-family:"T";font-weight:800;line-height:.95;color:${ink};width:${String(TITLE_FIT.width)}px;overflow-wrap:normal;text-wrap:balance;text-shadow:0 4px 0 ${ground}}
.band{position:absolute;left:0;right:0;bottom:0;height:${String(band)}px;background:${hue};color:${ground};display:flex;align-items:center;gap:18px;padding:0 48px 0 40px}
.cast{display:flex;align-items:center}
.voice{display:flex;flex-direction:column;gap:4px}
.t{font-family:"T";font-weight:800;text-transform:uppercase}
.big{font-size:${String(BAND_PX.main)}px;line-height:.95}
.under{font:600 ${String(BAND_PX.under)}px/1 "L";letter-spacing:.02em}
.me{margin-left:auto;display:flex;align-items:center;gap:10px}
</style></head><body>
<svg class="shape" viewBox="${GENRE_VIEW_BOX}" xmlns="http://www.w3.org/2000/svg">${shape}</svg>
<div class="upper"><div class="genre">${escaped(GENRE_NAMES[input.genre])}</div><div class="title" data-title style="font-size:${String(titlePx)}px">${escaped(input.title)}</div></div>
<div class="band" data-voices="${input.voices}"><div class="cast">${cast}</div><div class="voice"><div class="t big">${escaped(words.main)}</div><div class="under">${escaped(words.under)}</div></div>${plusMe}</div>
</body></html>`
}
