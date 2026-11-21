/**
 * The genres: GENRE_PAINT and the shapes of
 * apps/www/src/components/studio/genre-thumbs.tsx, copied here as SVG text
 * (a prototype; the build would move the one drawing into some-styles so
 * Studio's row and the thumbnail share it), with a title per genre and the
 * cast it is assumed to speak with. Mochi appears only where the owner's own
 * voice is in the episode; the birds are the synthetic voices (cast-v1:
 * tutor tin-owlet, asker tin-sparrow).
 */
import type { Character } from "../../packages/some-styles/src/brand/cast"

export type Genre =
  | "call"
  | "cards-essay"
  | "interview-essay"
  | "playoff-delta"
  | "report"
  | "rust-essay"

type Facts = {
  readonly name: string
  readonly hue: string
  readonly ground: string
  readonly cast: ReadonlyArray<Character>
  readonly titles: { readonly short: string; readonly long: string }
}

export const GENRES: Readonly<Record<Genre, Facts>> = {
  call: {
    name: "The weekly call",
    hue: "#e8a93c",
    ground: "#2e2416",
    cast: ["tin-owlet", "tin-sparrow"],
    titles: {
      short: "Week 47: a voice changes at each chapter",
      long: "Week 47: the choir merges eleven PRs, the voices change only at a chapter, and what still waits on me",
    },
  },
  "cards-essay": {
    name: "Cards essay",
    hue: "#e3d2ab",
    ground: "#29241a",
    cast: ["mochi", "tin-owlet"],
    titles: {
      short: "A finished episode goes home as its DNA",
      long: "Home refuses a DNA with any field it doesn't name, and what that costs a template version pinned months ago",
    },
  },
  "interview-essay": {
    name: "Interview essay",
    hue: "#b5a6ec",
    ground: "#201b33",
    cast: ["mochi", "tin-sparrow"],
    titles: {
      short: "Full-stack engineer, driver tools",
      long: "Full-stack engineer, driver tools: how I explained a cache invalidation bug, and the stronger answer I missed",
    },
  },
  "playoff-delta": {
    name: "Playoff Delta",
    hue: "#c9d46a",
    ground: "#252914",
    cast: ["tin-owlet"],
    titles: {
      short: "Week 12: one path left to the playoffs",
      long: "Week 12: Sunday's three results close two paths, and the one left needs a win in Green Bay and help from Dallas",
    },
  },
  report: {
    name: "Engagement report",
    hue: "#ef8a6b",
    ground: "#2e1a14",
    cast: ["tin-owlet"],
    titles: {
      short: "Week of Nov 16: what I took",
      long: "Week of Nov 16: what each app put in front of me and what I took, against last week, a quarter ago and a year ago",
    },
  },
  "rust-essay": {
    name: "Rust Rounds",
    hue: "#e58fb6",
    ground: "#2d1724",
    cast: ["mochi", "tin-owlet"],
    titles: {
      short: "Elision: the rule rustc applied without a word",
      long: "Elision: the rule rustc applied without a word, and why the second reference in my signature needed a name after all",
    },
  },
}

type Draw = (hue: string, dim: string, ground: string) => string

const CALL_COLUMNS = [
  { items: 3, column: 0 },
  { items: 2, column: 1 },
  { items: 4, column: 2 },
]
const INTERVIEW_BARS = [10, 22, 14, 28, 18, 24, 10].map((h, i) => ({
  h,
  x: 182 + i * 10,
}))
const REPORT_PAIRS = [
  [44, 62],
  [70, 52],
  [30, 48],
  [56, 84],
].map(([last, now], i) => ({ last: last!, now: now!, x: 74 + i * 46 }))
const RUST_BARS = [14, 30, 22, 44, 34, 52, 28, 40, 18, 32, 12].map((h, i) => ({
  h,
  x: 194 + i * 9,
  lit: i % 3 === 1,
}))

export const SHAPES: Readonly<Record<Genre, Draw>> = {
  call: (hue, dim) =>
    CALL_COLUMNS.map(({ items, column }) => {
      const x = 62 + column * 70
      return `<rect x="${x}" y="34" width="58" height="112" rx="8" fill="none" stroke="${hue}" stroke-width="3" opacity="0.9"/><rect x="${x + 8}" y="42" width="30" height="5" rx="2.5" fill="${hue}"/>${Array.from(
        { length: items },
        (_, i) =>
          `<rect x="${x + 8}" y="${56 + i * 21}" width="42" height="15" rx="4" fill="${i === 0 && column === 1 ? hue : dim}"/>`
      ).join("")}`
    }).join("") +
    `<path d="M262 28h34a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-20l-10 9v-9h-4a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z" fill="${hue}"/>`,
  "cards-essay": (hue, dim, ground) =>
    [
      { turn: -14, stroke: dim },
      { turn: 9, stroke: dim },
      { turn: 0, stroke: hue },
    ]
      .map(
        ({ turn, stroke }) =>
          `<rect x="122" y="40" width="76" height="104" rx="9" fill="${ground}" stroke="${stroke}" stroke-width="3" transform="rotate(${turn} 160 96)"/>`
      )
      .join("") +
    `<rect x="134" y="56" width="40" height="6" rx="3" fill="${hue}"/><rect x="134" y="70" width="52" height="5" rx="2.5" fill="${dim}"/><rect x="134" y="82" width="46" height="5" rx="2.5" fill="${dim}"/><circle cx="160" cy="118" r="13" fill="${hue}"/><path d="M153 118l5 5 9-10" fill="none" stroke="${ground}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  "interview-essay": (hue, _dim, ground) =>
    `<path d="M70 44h92a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12h-56l-20 18v-18h-16a12 12 0 0 1-12-12V56a12 12 0 0 1 12-12z" fill="${hue}"/><path d="M108 66c0-6 4-9 9-9s9 3 9 8c0 6-8 7-8 13M118 86v2" fill="none" stroke="${ground}" stroke-width="5" stroke-linecap="round"/><path d="M162 76h88a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12h-14v16l-18-16h-56a12 12 0 0 1-12-12V88a12 12 0 0 1 12-12z" fill="${ground}" stroke="${hue}" stroke-width="3.5"/>${INTERVIEW_BARS.map(
      ({ h, x }) =>
        `<rect x="${x}" y="${106 - h / 2}" width="5" height="${h}" rx="2.5" fill="${hue}"/>`
    ).join("")}`,
  "playoff-delta": (hue, dim) =>
    `<line x1="250" y1="26" x2="250" y2="150" stroke="${hue}" stroke-width="2.5" stroke-dasharray="6 6"/><polyline points="40,128 90,116 140,120 190,86 236,60 262,48" fill="none" stroke="${hue}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="40,104 90,108 140,96 190,112 236,128" fill="none" stroke="${dim}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="262" cy="48" r="7" fill="${hue}"/><path d="M58 30 L84 72 H32 Z" fill="none" stroke="${hue}" stroke-width="5" stroke-linejoin="round"/>`,
  report: (hue, dim) =>
    `<rect x="62" y="132" width="196" height="3" rx="1.5" fill="${hue}"/>${REPORT_PAIRS.map(
      ({ last, now, x }) =>
        `<rect x="${x}" y="${130 - last}" width="14" height="${last}" rx="3" fill="${dim}"/><rect x="${x + 17}" y="${130 - now}" width="14" height="${now}" rx="3" fill="${hue}"/>`
    ).join("")}`,
  "rust-essay": (hue, dim, ground) =>
    Array.from(
      { length: 10 },
      (_, i) =>
        `<rect x="113" y="40" width="14" height="18" rx="3" fill="${hue}" transform="rotate(${i * 36} 120 90)"/>`
    ).join("") +
    `<circle cx="120" cy="90" r="40" fill="${hue}"/><circle cx="120" cy="90" r="27" fill="${ground}"/><path d="M114 78c-5 0-6 2-6 6v2c0 3-1 4-4 4 3 0 4 1 4 4v2c0 4 1 6 6 6M126 78c5 0 6 2 6 6v2c0 3 1 4 4 4-3 0-4 1-4 4v2c0 4-1 6-6 6" fill="none" stroke="${hue}" stroke-width="3.5" stroke-linecap="round"/>${RUST_BARS.map(
      ({ h, x, lit }) =>
        `<rect x="${x}" y="${90 - h / 2}" width="5" height="${h}" rx="2.5" fill="${lit ? hue : dim}"/>`
    ).join("")}`,
}
