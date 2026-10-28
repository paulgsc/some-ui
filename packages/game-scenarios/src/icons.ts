/**
 * Each scenario's icon: 24x24 stroke paths (stroke 1.75, round caps and
 * joins), from the Game Week Bites canvas. A meaning that recurs is drawn by
 * the same primitive, as Playoff Delta's glyphs are
 * (`packages/ui/playoff-delta/src/lib/symbols.ts`): `NOT` is a slash across
 * the eye, `FOR_US` and `AGAINST_US` an arrow up or down on the right.
 */
import type { ScenarioId } from "@game-scenarios/words"

/** A circle as a path, so every part of an icon is a `<path d>`. */
function circle(x: number, y: number, r: number): string {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

export const PRIMITIVES = {
  EYE: ["M1 9s2.5-5 7-5 7 5 7 5-2.5 5-7 5S1 9 1 9z", circle(8, 9, 2)],
  NOT: ["M2 2.5l12 13"],
  FOR_US: ["M19 21V8", "M15.5 11.5L19 8l3.5 3.5"],
  AGAINST_US: ["M19 8v13", "M15.5 17.5L19 21l3.5-3.5"],
  FORK: ["M12 21v-8", "M12 13L6 7", "M12 13l6-6"],
  CLOCK: [circle(12, 13, 7.5), "M12 13V9"],
} as const satisfies Record<string, ReadonlyArray<string>>

const P = PRIMITIVES

export const ICONS: Readonly<Record<ScenarioId, ReadonlyArray<string>>> = {
  "pre.weather": [
    "M7 15a4 4 0 0 1 .5-7.97A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7z",
    "M8 18l-1 2",
    "M12 18l-1 2",
    "M16 18l-1 2",
  ],
  "pre.injury-report": [
    "M9 3h6v3H9z",
    "M8 4.5H5V21h14V4.5h-3",
    "M12 10v6",
    "M9 13h6",
  ],
  "pre.venue": ["M3 11l9-7 9 7", "M5.5 9.5V20h13V9.5", "M10 20v-5h4v5"],
  "pre.coin-toss": [
    circle(12, 13, 7),
    "M12 9.5v7",
    "M4 4l2 2",
    "M20 4l-2 2",
    "M12 2v2",
  ],
  "pre.stakes": [...P.FORK, circle(6, 5, 2), circle(18, 5, 2)],
  "in.first-drive": ["M3 12h13", "M12 8l4 4-4 4", "M20 5v14"],
  "in.fell-behind": ["M3 7l6 6 4-4 8 8", "M15 17h6v-6"],
  "in.third-long": [
    "M3 19h18",
    "M5 19V8",
    "M19 19V8",
    "M8 13h8",
    "M14 11l2 2-2 2",
  ],
  "in.fourth-down": [
    "M12 21v-7",
    "M12 14L6 6",
    "M12 14l6-8",
    "M6 6h3",
    "M6 6v3",
    "M18 6h-3",
    "M18 6v3",
  ],
  "in.two-point": [
    "M3 12h6",
    "M6 9v6",
    "M13 9a3 3 0 0 1 6 0c0 2.2-6 4.2-6 7h6",
  ],
  "in.play-call": [circle(6, 17, 2.5), "M8 15l9-9", "M13 6h4v4", "M6 14.5V6"],
  "in.red-zone": [circle(12, 12, 8.5), circle(12, 12, 4.5), circle(12, 12, 1)],
  "in.two-minute": [...P.CLOCK, "M10 2.5h4", "M12 2.5v3"],
  "in.turnover": ["M4 8h13", "M14 5l3 3-3 3", "M20 16H7", "M10 13l-3 3 3 3"],
  "in.penalty": ["M6 21V4", "M6 4h12l-2.5 4 2.5 4H6"],
  "in.sack": [
    "M12 3v4",
    "M12 17v4",
    "M3 12h4",
    "M17 12h4",
    "M5.6 5.6l2.8 2.8",
    "M15.6 15.6l2.8 2.8",
    "M18.4 5.6l-2.8 2.8",
    "M8.4 15.6l-2.8 2.8",
  ],
  "in.big-play": ["M13 2L4 14h7l-1 8 9-12h-7z"],
  "in.kick": ["M6 3v8h8V3", "M10 11v10", "M16 15l5 5", "M21 15l-5 5"],
  "in.injury": [circle(12, 12, 9), "M12 8v8", "M8 12h8"],
  "post.result": [
    "M8 3h8v6a4 4 0 0 1-8 0z",
    "M8 5H5a3 3 0 0 0 3 4",
    "M16 5h3a3 3 0 0 1-3 4",
    "M12 13v4",
    "M8 21h8",
    "M10 17h4",
  ],
  "post.paths": [...P.FORK, circle(6, 5, 2), "M16 3l4 4", "M20 3l-4 4"],
  "post.pattern": [
    "M4 12a8 8 0 0 1 14-5.3",
    "M18 3v4h-4",
    "M20 12a8 8 0 0 1-14 5.3",
    "M6 21v-4h4",
  ],
  "you.caught-it": [...P.EYE, ...P.FOR_US],
  "you.sat-through": [...P.EYE, ...P.AGAINST_US],
  "you.missed-it": [...P.EYE, ...P.NOT, ...P.FOR_US],
  "you.dodged-it": [...P.EYE, ...P.NOT, ...P.AGAINST_US],
  "you.tuned-in-late": [
    ...P.EYE,
    circle(17.5, 17, 4.5),
    "M17.5 14.5V17l1.8 1.2",
  ],
}
