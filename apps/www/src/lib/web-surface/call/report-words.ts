import type {
  CountKind,
  PublicChange,
  PublicCount,
} from "@some-ui/video-render"

/**
 * Every word the engagement report's stage shows besides the report's own
 * (its lines' names and said words, which the writer fills), the format's
 * scene names and the frame's (`./frame-words`), in one table.
 */
export const REPORT_WORDS = {
  title: "Engagement report",
  sample: "Sample report",
  chapter: (title: string): string => `Chapter: ${title}`,
  /** A week by its id, "2026-W46", as the frame names it. */
  week: (id: string): string => `Week ${id.slice(id.indexOf("W") + 1)}`,
  weekOf: (id: string, from: string, to: string): string =>
    `${id} · ${from.slice(0, 10)} – ${to.slice(0, 10)}`,
  part: (n: number, of: number): string => `part ${n} of ${of}`,
  pipelines: (n: number): string => (n === 1 ? "1 pipeline" : `${n} pipelines`),
  line: "Line",
  thisWeek: "This week",
  takenAgainst: "Taken, against",
  kind: {
    offered: "Offered",
    taken: "Taken",
    passedOver: "Passed over",
    left: "Left",
  } satisfies Record<CountKind, string>,
  against: { last: "Last week", quarter: "A quarter ago", year: "A year ago" },
  count: (n: PublicCount): string =>
    n === "no-data" ? "No data" : n === "fewer-than-5" ? "< 5" : String(n),
  change: (change: PublicChange): string => {
    if (change.way === "unknown") return "–"
    if (change.way === "flat") return "="
    const by = change.by === null ? "" : ` ${change.by}`
    return `${change.way === "up" ? "▲" : "▼"}${by}`
  },
  legend:
    "< 5: fewer than 5 · ▲ up · ▼ down · = the same · –: can't be shown, as a side is under 5 or has no record",
  wing: "Wing",
  lines: "Lines",
  takenFive: "Taken 5 times or more",
  noRecord: "Home holds no record of this week",
  nothingMoved: "Nothing moved by a difference that can be shown",
  /** Why the stage draws no report of the week it was asked for. */
  unread: (week: string): string => `No report of ${week} could be read`,
  otherWeek: (asked: string, got: string): string =>
    `The report read is ${got}'s, not ${asked}'s`,
} as const
