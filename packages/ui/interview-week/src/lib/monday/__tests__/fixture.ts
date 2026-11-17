import type { Bundle, Corpus } from "@interview-week/lib/monday/bundle"
import { SAY_WORDS_PER_MINUTE } from "@interview-week/lib/monday/finish"
import type { Values } from "@interview-week/lib/monday/values"
import { VALUES_SCHEMA } from "@interview-week/lib/monday/values"
import type { Ready } from "@interview-week/lib/week"

const call = (id: string, made: string): Corpus["calls"][number] => ({
  id,
  made,
  chose: `what ${id} chose`,
  options: ["(a) this", "(b) that"],
  gray: "why it was gray",
  undo: "how to undo it",
  refs: ["#2931"],
})

/** The commit the fixture's body of work is read at. */
export const COMMIT = "c9fd3215e0a1b2c3d4e5f60718293a4b5c6d7e8f"

/** A small corpus: three calls, two epics, two docs, two invariants and a pull. */
export const corpus: Corpus = {
  calls: [
    call("C266", "2026-11-13"),
    call("C265", "2026-11-13"),
    call("C9", "2026-10-01"),
  ],
  epics: [
    {
      key: "issue:some-ui#2931",
      repo: "some-ui",
      number: 2931,
      title: "Interview week",
      text: "Why:\nPractice.",
    },
    {
      key: "issue:server#800",
      repo: "server",
      number: 800,
      title: "Home",
      text: "Why:\nKeep it.",
    },
  ],
  docs: [
    {
      key: "doc:docs/asks.md",
      path: "docs/asks.md",
      title: "Asks",
      text: "What waits on the owner.",
    },
    {
      key: "doc:docs/ui-fit/README.md",
      path: "docs/ui-fit/README.md",
      title: "UI fit",
      text: "Screens hold still.",
    },
  ],
  invariants: [
    {
      key: "invariant:RS1",
      id: "RS1",
      path: "CLAUDE.md",
      title: "RS1: reads",
      text: "**RS1: reads.**",
    },
    {
      key: "invariant:L3",
      id: "L3",
      path: "extensions/common/GOOD_CITIZEN.md",
      title: "L3: names",
      text: "**L3: names.**",
    },
  ],
  pulls: [
    {
      repo: "some-ui",
      number: 3170,
      title: "a home link run waits out the pairing read as state",
    },
  ],
}

/** A script of `lines` lines of ten words each: read aloud, about four seconds a line. */
export const script = (lines: number): string =>
  Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1} of the read, said aloud in one breath.`
  ).join("\n")

/** `n` words of a sentence said aloud. */
const words = (n: number): string =>
  Array.from({ length: n }, (_, i) => (i === 0 ? "I" : "said")).join(" ")

/**
 * A ready answer that passes `finish` for a `targetSeconds` question: four
 * parts at 80% of the target's words, each citing what the corpus holds.
 */
export function readyFor(targetSeconds: number): Ready {
  const target = (targetSeconds / 60) * SAY_WORDS_PER_MINUTE
  const part = Math.round((target * 0.8) / 4)
  const cite = [{ kind: "pull", repo: "some-ui", number: 3170 } as const]
  return {
    answer: [
      "The situation",
      "The options",
      "The choice",
      "The edge cases",
    ].map((label) => ({
      label,
      text: words(part),
      note: "Names what the listener can check.",
      sources: cite,
    })),
    another: {
      text: words(Math.round(target * 0.7)),
      note: "Leads with the principle, then the example.",
      sources: [{ kind: "call", id: "C266" }],
    },
    poor: {
      text: words(30),
      notes: [
        "Doesn't say what failed, or for whom.",
        "Names no alternative at all.",
      ],
      sources: [],
    },
    cues: ["not known yet", "wait in each caller", "the type holds it"],
  }
}

/** Words that fill every slot of `bundle`'s next week and pass `finish`. */
export function valuesFor(bundle: Bundle): Values {
  const next = bundle.next
  if (next === null) return { schema: VALUES_SCHEMA, week: null }
  return {
    schema: VALUES_SCHEMA,
    week: {
      company: {
        name: "Tidewell",
        about:
          "Tidewell publishes tide tables for small harbours along the coast.",
      },
      role: {
        title: "Backend engineer",
        about:
          "You own the feed that turns gauge readings into the published tables.",
      },
      questions: next.questions.map((q) => ({
        id: q.id,
        prompt: `${q.asks} Tell me in the terms of this role.`,
        guidelines: [
          "Names the situation in a sentence or two.",
          "Says what they did and what came of it.",
        ],
        ready: readyFor(q.targetSeconds),
      })),
      cards: next.cards.map((c) => ({ id: c.id, script: script(20) })),
    },
  }
}
