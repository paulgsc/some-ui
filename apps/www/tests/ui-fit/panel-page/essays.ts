import {
  essayFit,
  EssaySchema,
  parseEssay,
  sampleEssay,
} from "@some-ui/video-render"
import type { Essay } from "@some-ui/video-render"

/**
 * The essays `../essay-fit.spec.ts` draws (EF1): the template's sample, and
 * the sample with each text the routine writes on a best, beside or deep
 * dive scene grown word by word, and a dive's code line by line, to the most
 * the model accepts.
 */

/** Plain prose, wide letters first, with code spans as the routine writes them. */
const WORDS = [
  "Whenever",
  "MOMENTUM",
  "wandering",
  "`Vec<&'a str>`",
  "homework",
  "WebView",
  "Mandarin",
  "mailbox",
  "`push_str`",
  "overwhelm",
  "Monday",
  "windows",
  "Malformed",
  "workflows",
  "memory",
  "Woodworking",
  "shown",
  "drawn",
  "owner",
  "week",
] as const

const prose = (n: number, from = 0): string =>
  Array.from(
    { length: n },
    (_, i) => WORDS[(from + i) % WORDS.length] ?? "word"
  ).join(" ")

/** A line of Rust as wide as `columns`. */
const codeLine = (columns: number, i: number): string =>
  `let w${String(i)} = ${"m".repeat(Math.max(1, columns - 12))};`.slice(
    0,
    columns
  )

export function sample(): Essay {
  const parsed = sampleEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

function edited(essay: Essay, change: (draft: Essay) => void): Essay {
  const draft = structuredClone<Essay>(essay)
  change(draft)
  return EssaySchema.parse(draft)
}

const accepted = (essay: Essay): boolean =>
  parseEssay(essay).ok && essayFit(essay).problems.length === 0

/** `essay` with what `set` writes grown, a step at a time, to the most the model accepts. */
function grown(essay: Essay, set: (draft: Essay, n: number) => void): Essay {
  let best = essay
  for (let n = 1; n < 400; n += 1) {
    const next = edited(essay, (e) => set(e, n))
    if (!accepted(next)) break
    best = next
  }
  return best
}

/** Each text of the sample's best, beside and dive scenes, each grown to its limit. */
export function atTheLimit(): ReadonlyArray<Essay> {
  const base = sample()
  const dives = (
    e: Essay,
    set: (d: Essay["tickets"][number]["dives"][number]) => void
  ): void => {
    for (const ticket of e.tickets) for (const dive of ticket.dives) set(dive)
  }
  return [
    grown(base, (e, n) => {
      for (const ticket of e.tickets)
        for (const point of ticket.points) point.best = prose(n, n)
    }),
    grown(base, (e, n) => {
      for (const ticket of e.tickets)
        for (const point of ticket.points) point.to = prose(n, n)
    }),
    grown(base, (e, n) => {
      for (const ticket of e.tickets)
        if (ticket.answer.kind === "take")
          for (const mark of ticket.answer.marks) mark.note = prose(n, n)
    }),
    grown(base, (e, n) => {
      for (const ticket of e.tickets)
        if (ticket.answer.kind === "take") ticket.answer.solo.why = prose(n, n)
    }),
    grown(base, (e, n) => {
      dives(e, (dive) => {
        dive.title = prose(n, n)
      })
    }),
    grown(base, (e, n) => {
      dives(e, (dive) => {
        dive.shows = Array.from({ length: 5 }, (_, i) => prose(n, n + i))
      })
    }),
    grown(base, (e, n) => {
      dives(e, (dive) => {
        dive.code = Array.from({ length: n }, (_, i) => codeLine(40, i)).join(
          "\n"
        )
      })
    }),
    grown(base, (e, n) => {
      dives(e, (dive) => {
        dive.code = [codeLine(40 + n, 0), codeLine(40, 1)].join("\n")
      })
    }),
  ]
}
