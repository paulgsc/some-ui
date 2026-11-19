import {
  essayFit,
  EssaySchema,
  parseEssay,
  sampleEssay,
} from "@some-ui/video-render"
import type { Essay, EssayPointAnswer } from "@some-ui/video-render"

import { grown as grownBy, prose as words, WORDS_WITH_CODE } from "./grown"

/**
 * The essays `../essay-fit.spec.ts` draws (EF1): the template's sample, and
 * the sample with each text the routine writes on a best, beside or deep
 * dive scene grown word by word, and a dive's code line by line, to the most
 * the model accepts.
 */

const prose = (n: number, from = 0): string => words(n, from, WORDS_WITH_CODE)

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

/** Whether the model and the schema accept `essay`: the fixture's verdict too. */
export const accepted = (essay: Essay): boolean =>
  parseEssay(essay).ok && essayFit(essay).problems.length === 0

const grown = (essay: Essay, set: (draft: Essay, n: number) => void): Essay =>
  grownBy(essay, set, {
    parse: (raw) => EssaySchema.parse(raw),
    accepts: accepted,
  })

/**
 * The sample with points answered by takes of their own (RR24): QM-311's
 * whole take beside point 1's own, QM-312 answered only point by point, and
 * QM-313's silence beside point 2's own, so the beside table cites a take
 * under every kind of row.
 */
export function byPoints(): Essay {
  const essay = structuredClone(sample())
  const own = (mark: "covered" | "partly" | "missing"): EssayPointAnswer => ({
    kind: "take",
    transcript: "Said on its own.",
    mark: mark === "covered" ? { mark } : { mark, note: "What it left out." },
    solo: { level: 3, why: "One reason." },
  })
  const answer = (
    ticket: number,
    point: number,
    of: EssayPointAnswer
  ): void => {
    const at = essay.tickets.at(ticket)?.points.at(point)
    if (at === undefined) throw new Error("the sample changed shape")
    at.answer = of
  }
  answer(0, 0, own("covered"))
  const second = essay.tickets.at(1)
  if (second === undefined) throw new Error("the sample changed shape")
  second.answer = { kind: "silence", opened: 1 }
  answer(1, 0, own("partly"))
  answer(1, 1, own("partly"))
  answer(1, 2, own("missing"))
  answer(2, 1, own("covered"))
  return essay
}

/**
 * The sample with QM-311's first point as a fork (RR29): three listed
 * options, a hidden best, and the owner's decision judged and placed.
 */
export function withForks(): Essay {
  const essay = structuredClone(sample())
  const first = essay.tickets.at(0)
  const point = first?.points.at(0)
  if (first === undefined || point === undefined)
    throw new Error("the sample changed shape")
  first.stated = [
    { id: "S1", says: "p99 under 2 ms per record" },
    { id: "F1", says: "40,000 records a second" },
    { id: "F2", says: "one core" },
  ]
  point.fork = {
    options: [
      {
        id: "A",
        recommended: true,
        decision: "Clone each field into its own `String`.",
        model: { id: "owned-is-safe", name: "Owning is always safe" },
        meets: ["F2"],
        breaks: ["S1"],
      },
      {
        id: "B",
        recommended: false,
        decision: "Borrow `&str` slices of the buffer.",
        model: { id: "borrow", name: "Borrow, then reuse" },
        meets: ["S1"],
        breaks: ["F1"],
      },
      {
        id: "C",
        recommended: false,
        decision: "Wrap the buffer in an `Arc` and share it.",
        model: { id: "share", name: "Share instead of copy" },
        meets: [],
        breaks: ["S1", "F2"],
      },
    ],
    best: {
      kind: "hidden",
      decision: "Parse in place, one arena per batch, reset between batches.",
      why: "It allocates once per batch, so it meets the rate on one core.",
      model: { id: "arena", name: "An arena per batch" },
      meets: ["S1", "F1", "F2"],
      breaks: [],
    },
    said: "The agent listed three options. None meets all three constraints.",
    judged: {
      decision: { kind: "recommended-by-default" },
      verdict: {
        kind: "off",
        why: "A breaks S1: a `String` per field allocates on every record.",
      },
      placement: "trusted",
    },
  }
  return essay
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
        for (const [i, point] of ticket.points.entries())
          point.to = prose(n, n + i)
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
    // Each point's own take's note (RR24), under its cite.
    grown(byPoints(), (e, n) => {
      for (const ticket of e.tickets)
        for (const point of ticket.points)
          if (point.answer?.kind === "take")
            point.answer.mark.note = prose(n, n)
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
    grown(base, (e, n) => {
      dives(e, (dive) => {
        dive.code = [`${"\t".repeat(n)}let x = 1;`, codeLine(40, 1)].join("\n")
      })
    }),
  ]
}
