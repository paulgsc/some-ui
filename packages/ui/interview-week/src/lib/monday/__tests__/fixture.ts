import type { Bundle, Corpus } from "@interview-week/lib/monday/bundle"
import type { Values } from "@interview-week/lib/monday/values"
import { VALUES_SCHEMA } from "@interview-week/lib/monday/values"

const call = (id: string, made: string): Corpus["calls"][number] => ({
  id,
  made,
  chose: `what ${id} chose`,
  options: ["(a) this", "(b) that"],
  gray: "why it was gray",
  undo: "how to undo it",
  refs: ["#2931"],
})

/** A small corpus: three calls, two epics, two docs and two invariants. */
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
}

/** A script of `lines` lines of ten words each: read aloud, about four seconds a line. */
export const script = (lines: number): string =>
  Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1} of the read, said aloud in one breath.`
  ).join("\n")

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
      })),
      cards: next.cards.map((c) => ({ id: c.id, script: script(20) })),
    },
  }
}
