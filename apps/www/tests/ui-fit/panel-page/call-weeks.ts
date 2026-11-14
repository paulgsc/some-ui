import {
  CALL_BOARD_MOST,
  CALL_LATER_MOST,
  CALL_MOST,
  CallWeekSchema,
  parseCallWeek,
  sampleCallWeek,
} from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"

/**
 * The weeks `../call-fit.spec.ts` draws (CF1), beside the one it hands the
 * page: the template's sample, every list at its longest, and the sample with
 * each free text grown word by word to the longest the model accepts.
 */

/** The words the generated weeks are written in: plain prose, wide letters first. */
const WORDS = [
  "Whenever",
  "MOMENTUM",
  "wandering",
  "homework",
  "WebView",
  "Mandarin",
  "mailbox",
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
  "home",
  "wins",
] as const

/** `n` words of `WORDS`, from the `from`th. */
const prose = (n: number, from = 0): string =>
  Array.from(
    { length: n },
    (_, i) => WORDS[(from + i) % WORDS.length] ?? "word"
  ).join(" ")

export function sample(): CallWeek {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

/** A copy of `week` changed by `change`, read back against the schema. */
function edited(week: CallWeek, change: (draft: CallWeek) => void): CallWeek {
  const draft = structuredClone<CallWeek>(week)
  change(draft)
  return CallWeekSchema.parse(draft)
}

/** Every list at the longest the schema allows, each item's words long. */
export function longest(): CallWeek {
  return edited(sample(), (w) => {
    const pull = (i: number): CallWeek["done"][number]["pulls"][number] => ({
      repo: "some-ui" as const,
      kind: "pr" as const,
      number: 2900 + i,
      title: prose(14, i),
      change: "defect" as const,
    })
    w.board.rows = Array.from({ length: CALL_BOARD_MOST }, (_, i) => ({
      ledger: `row-${i}`,
      title: prose(6, i),
      status: "decide" as const,
      waitsOnYou: 12,
    }))
    w.done = Array.from({ length: CALL_MOST.done }, (_, i) => ({
      id: `batch-${i}`,
      title: prose(5, i),
      said: "It landed.",
      pulls: Array.from({ length: 30 }, (_, j) => pull(i * 30 + j)),
    }))
    w.moved = []
    w.later = Array.from({ length: CALL_LATER_MOST }, (_, i) => ({
      id: `later-${i}`,
      question: prose(16, i),
      refs: [
        { repo: "some-ui" as const, kind: "issue" as const, number: 1000 + i },
        { repo: "server" as const, kind: "issue" as const, number: 100 + i },
      ],
    }))
  })
}

/**
 * `week` with the text `set` writes grown, a word at a time, to the most the
 * model accepts for its scene.
 */
function grown(
  week: CallWeek,
  set: (draft: CallWeek, words: string) => void
): CallWeek {
  let best = week
  for (let n = 1; n < 400; n += 1) {
    const next = edited(week, (w) => set(w, prose(n, n)))
    if (!parseCallWeek(next).ok) break
    best = next
  }
  return best
}

/** Each free text of the sample's items, each grown to its limit. */
export function atTheLimit(): ReadonlyArray<CallWeek> {
  const base = sample()
  return [
    grown(base, (w, words) => {
      for (const ask of w.asks) ask.question = words
    }),
    grown(base, (w, words) => {
      for (const ask of w.asks) ask.whyYours = words
    }),
    grown(base, (w, words) => {
      for (const ask of w.asks)
        for (const option of ask.options) option.unblocks = words
    }),
    grown(base, (w, words) => {
      for (const call of w.mine) call.why = words
    }),
    grown(base, (w, words) => {
      for (const call of w.mine) call.undo = words
    }),
    grown(base, (w, words) => {
      for (const gray of w.gray) gray.title = words
    }),
    grown(base, (w, words) => {
      for (const epic of w.moved) epic.next = [words, words]
    }),
    grown(base, (w, words) => {
      for (const batch of w.done) batch.title = words
    }),
  ]
}
