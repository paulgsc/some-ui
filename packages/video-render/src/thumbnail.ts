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

import { isoWeekMonday } from "@some-ui/core-utils"
import { characterSvg, escapeText, nodesText } from "@some-ui/styles/brand/cast"
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

/**
 * The facts of an episode its title is made from, per genre: the same facts
 * its cut list, description and chapters already read, never a title typed
 * for it. A genre with no entry here fails the build (`FactsByGenre[G]`).
 */
type FactsByGenre = {
  /** The call's week, by its first and last day, and which part of how many. */
  readonly call: {
    readonly from: string
    readonly to: string
    readonly part: number
    readonly of: number
  }
  /** A cards essay's own title, from its cut list. */
  readonly "cards-essay": { readonly title: string }
  /** The essay's week (`2026-w48`), and its first game: "NE at CHI". */
  readonly "game-essay": { readonly week: string; readonly firstGame: string }
  /** The role the interview week was for. */
  readonly "interview-essay": { readonly role: string }
  /** The season's label ("2025"), and the week, or the legend. */
  readonly "playoff-delta": {
    readonly season: string
    readonly week: number | "legend"
  }
  /** The ISO week the report covers: `2026-W46`. */
  readonly report: { readonly week: string }
  /** The essay's week (`2026-w46`) and its first ticket's title. */
  readonly "rust-essay": {
    readonly week: string
    readonly firstTicket: string | null
  }
}

/** One episode's facts, its genre named. */
export type ThumbnailFacts<G extends Genre = Genre> = {
  readonly [K in G]: { readonly genre: K } & FactsByGenre[K]
}[G]

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** A `YYYY-MM-DD` day as "Nov 5", the same on every host. */
const dayName = (day: string): string => {
  const [, month = 1, date = 1] = day.split("-").map(Number)
  return `${MONTHS[month - 1] ?? ""} ${String(date)}`
}

/** A week's number from its id, `2026-w46` or `2026-W46`: 46. */
const weekNumber = (week: string): number =>
  Number(/-w(\d+)$/i.exec(week)?.[1] ?? Number.NaN)

/**
 * Each genre's title, from its facts: one rule per genre, all of them, so a
 * new genre has no thumbnail until it has its rule.
 */
const TITLES: {
  readonly [G in Genre]: (facts: FactsByGenre[G]) => string
} = {
  call: ({ from, to, part, of }) => {
    const [first, last] = [dayName(from), dayName(to)]
    const sameMonth = first.split(" ")[0] === last.split(" ")[0]
    const range = `${first} – ${sameMonth ? (last.split(" ")[1] ?? "") : last}`
    return `The week of ${range}${of > 1 ? `, part ${String(part)} of ${String(of)}` : ""}`
  },
  "cards-essay": ({ title }) => title,
  "game-essay": ({ week, firstGame }) =>
    `Week ${String(weekNumber(week))}: ${firstGame}`,
  "interview-essay": ({ role }) => role,
  "playoff-delta": ({ season, week }) =>
    week === "legend"
      ? "The legend: how to read a week"
      : `Week ${String(week)}, ${season} season`,
  report: ({ week }) => `The week of ${dayName(isoWeekMonday(week))}`,
  "rust-essay": ({ week, firstTicket }) =>
    `Week ${String(weekNumber(week))}${firstTicket === null ? "" : `: ${firstTicket}`}`,
}

/** `facts`' title, by its genre's rule. */
export const thumbnailTitle = <G extends Genre>(
  facts: ThumbnailFacts<G>
): string => {
  const rule: (f: FactsByGenre[G]) => string = TITLES[facts.genre]
  return rule(facts)
}

/** What a thumbnail is drawn from. */
export type ThumbnailInput = {
  readonly genre: Genre
  readonly title: string
  readonly voices: ThumbnailVoices
}

/**
 * What `cut`'s thumbnail is drawn from: its genre's paint, the title its
 * facts make, and who speaks in it. The title is the one value the page
 * takes, so a title given another way would pass the same fit.
 */
export const thumbnailInput = (
  facts: ThumbnailFacts,
  cut: CutList
): ThumbnailInput => ({
  genre: facts.genre,
  title: thumbnailTitle(facts),
  voices: voicesOf(cut),
})

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
 * What the pinned fonts draw: the printable part of their latin subset's
 * `unicode-range` (@fontsource's barlow-condensed latin files): Basic Latin
 * and Latin-1 without control codes, ı, Œ and œ, general punctuation
 * (dashes, quotes, the ellipsis), € ™ ↑ ↓ − ∕. Anything else would be drawn
 * in whatever font the host has, so a title holding it is refused.
 */
const DRAWN =
  /^[\u0020-\u007e\u00a0-\u00ff\u0131\u0152\u0153\u2000-\u206f\u20ac\u2122\u2191\u2193\u2212\u2215]*$/u

/**
 * The size to draw the title at: the largest of `measured` whose layout
 * stays inside the title's box. Refused when none does, since every size
 * tried is one that reads at 320×180, and a smaller one would not.
 */
export const chooseTitleSize = (
  title: string,
  measured: ReadonlyArray<TitleMeasure>
): Parsed<number> => {
  if (!DRAWN.test(title))
    return {
      ok: false,
      problems: [
        `The title "${title}" has letters the thumbnail's font can't draw: write it in English letters.`,
      ],
    }
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
          `The title "${title}" is too long for the thumbnail: at any size that fits, it wouldn't read in YouTube's smallest list. Shorten it.`,
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
  "game-essay": "Game Week",
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

/** A character at `size`, its ground clear and its key light left out. */
const character = characterSvg

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
<div class="upper"><div class="genre">${escapeText(GENRE_NAMES[input.genre])}</div><div class="title" data-title style="font-size:${String(titlePx)}px">${escapeText(input.title)}</div></div>
<div class="band" data-voices="${input.voices}"><div class="cast">${cast}</div><div class="voice"><div class="t big">${escapeText(words.main)}</div><div class="under">${escapeText(words.under)}</div></div>${plusMe}</div>
</body></html>`
}
