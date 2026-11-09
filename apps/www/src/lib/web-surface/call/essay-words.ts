import type { Mark } from "@some-ui/video-render"

/**
 * Every word the essay's stage shows besides the essay's own data, the
 * format's scene names and the frame's (`./frame-words`), in one table.
 */
export const ESSAY_WORDS = {
  title: "Rust Rounds",
  sample: "Sample essay",
  whoMadeThis: "Who made this",
  brandIn: "Opening mark",
  brandOut: "Closing mark",
  chapter: (title: string): string => `Chapter: ${title}`,
  tutor: "Tutor",
  you: "You",
  week: (id: string): string => `Week ${id.slice(id.indexOf("w") + 1)}`,
  sla: "The SLA",
  story: "The story",
  speakTo: "Speak to",
  figures: "Figures the scenario gives",
  youSaid: "You said",
  noAnswer: "Nothing came for this one",
  opened: (n: number): string =>
    n === 0
      ? "Not opened"
      : n === 1
        ? "Opened once, nothing sent"
        : `Opened ${n} times, nothing sent`,
  point: "Point",
  yours: "Yours",
  mark: {
    covered: "Covered",
    partly: "Partly",
    missing: "Missing",
  } satisfies Record<Mark, string>,
  unanswered: "No answer",
  solo: "SOLO",
  level: (n: number, name: string): string => `${n}. ${name}`,
  notJudged: "No answer to place on the scale",
  dive: (n: number): string => `Deep dive ${n}`,
  past: "One step past the ticket",
  into: "Into",
  ticketOf: (n: number, of: number): string => `Ticket ${n} of ${of}`,
  cell: {
    unmet: "Not met that week",
    silent: "Not answered",
    decayed: "Lower than before: decayed",
  },
  legendLevel: "Shown, by SOLO level",
  role: "The role it fits",
  roleNext: (next: string, gap: string): string => `Next, ${next}: ${gap}`,
  roleSource: (ladder: string, source: string): string =>
    `On ${ladder} (${source}), worked out from the weeks above`,
  nextWeek: (id: string): string => `Week ${id.slice(id.indexOf("w") + 1)}`,
  comesBackTo: "Comes back to",
} as const
