import { prepare } from "@interview-week/lib/monday/bundle"
import { finish } from "@interview-week/lib/monday/finish"
import { VALUES_SCHEMA } from "@interview-week/lib/monday/values"
import { describe, expect, it } from "vitest"

import { COMMIT, corpus, OPENING, script, valuesFor } from "./fixture"

const { bundle } = prepare({
  commit: COMMIT,
  now: new Date("2026-11-16T11:41:00Z"),
  brief: [],
  corpus,
})

const problems = (
  values: unknown,
  resumeEmployers: Array<string> = []
): Array<string> => {
  const done = finish({ bundle, values, resumeEmployers })
  return done.ok ? [] : done.problems
}

describe("the interview week's finish", () => {
  it("builds the week the bundle chose, with the model's words", () => {
    const done = finish({
      bundle,
      values: valuesFor(bundle),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const [file] = done.files
    expect(file?.name).toBe("interview-week-2026-w47.json")
    expect(file?.body.questions[4]?.source).toEqual({
      kind: "call",
      id: "C266",
    })
    // The opening's words at 150 a minute, then 200 words at 150 a minute.
    const [opening, ...cards] = file?.body.cards ?? []
    expect(opening).toMatchObject({
      id: "opening",
      source: { kind: "opening" },
    })
    expect(opening?.targetSeconds).toBe(
      Math.round((OPENING.split(/\s+/u).length / 150) * 60)
    )
    expect(cards.map((c) => c.targetSeconds)).toEqual([80, 80, 80])
  })

  it("asks for every slot once, and refuses one the bundle didn't ask for", () => {
    const values = valuesFor(bundle)
    const week = values.week!
    expect(
      problems({
        ...values,
        week: {
          ...week,
          questions: [
            ...week.questions.slice(1),
            { ...week.questions[1]!, id: "read" },
          ],
          cards: [...week.cards, week.cards[1]!],
        },
      })
    ).toEqual([
      'week.questions: "read" isn\'t one the bundle asks for',
      'week.questions: write "walk-me-through", as the bundle asks',
      'week.cards: "epic-2931" is written twice',
    ])
  })

  it("holds a script to one or two minutes, a breath a line", () => {
    const values = valuesFor(bundle)
    const week = values.week!
    const cards = [
      week.cards[0]!,
      { ...week.cards[1]!, script: script(5) },
      { ...week.cards[2]!, script: script(20).replaceAll("\n", " ") },
      week.cards[3]!,
    ]
    expect(problems({ ...values, week: { ...week, cards } })).toEqual([
      'week.cards[1] ("epic-2931").script: 50 words; write 150 to 300',
      'week.cards[2] ("doc-asks").script, line 1: 200 words; break a line where a breath belongs, at most 30 words',
    ])
  })

  it("holds the essay's opening to the moniker first, a short read, and no rating or finish line (IW10)", () => {
    const values = valuesFor(bundle)
    const week = values.week!
    const opening = (text: string): ReadonlyArray<string> =>
      problems({
        ...values,
        week: {
          ...week,
          cards: [{ ...week.cards[0]!, script: text }, ...week.cards.slice(1)],
        },
      })
    expect(opening(OPENING)).toEqual([])
    expect(
      opening(
        `This week I train decision stories, until I'm ready for the interview.\n${OPENING.split("\n").slice(1).join("\n")}\nThen I'll check my rating, and grade how I did.`
      )
    ).toEqual([
      'week.cards[0] ("opening").script: the opening says "paulgsc" in its first line',
      'week.cards[0] ("opening").script: "ready for the" assesses; the opening says what the practice trains, with no rating and no finish line',
      'week.cards[0] ("opening").script: "rating" assesses; the opening says what the practice trains, with no rating and no finish line',
      'week.cards[0] ("opening").script: "grade" assesses; the opening says what the practice trains, with no rating and no finish line',
    ])
    expect(
      opening(
        `Paulgsc here.\n${OPENING.split("\n").slice(1).join("\n")}\nI'll tell a time a deploy failed, the tests that pass, a rate limit, a high level view, and how I assess a trade-off to finish the migration.`
      )
    ).toEqual([])
    expect(opening(script(20))[0]).toBe(
      'week.cards[0] ("opening").script: 200 words; write 25 to 90'
    )
    // A dash or an ampersand alone is no word, as a reader counts them.
    expect(opening(`${OPENING} ${" —".repeat(80)} &`)).toEqual([])
  })

  it("builds each question's ready answer, and refuses a source outside the body of work at the commit, a length off its target and an employer", () => {
    const values = valuesFor(bundle)
    const done = finish({ bundle, values, resumeEmployers: [] })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    expect(done.files[0]?.body.schema).toBe("some-ui.interview-week/2")
    expect(done.files[0]?.body.questions[0]?.ready?.cues).toHaveLength(3)

    const week = values.week!
    const first = week.questions[0]!
    const ready = first.ready
    const changed = {
      ...first,
      ready: {
        ...ready,
        answer: [
          {
            ...ready.answer[0]!,
            sources: [{ kind: "pull", repo: "server", number: 9999 } as const],
          },
          ready.answer[1]!,
          {
            ...ready.answer[2]!,
            text: "I said it plainly and then I stopped there.",
          },
        ],
        poor: {
          ...ready.poor,
          notes: [
            "Says it was at Harbour Works.",
            ...ready.poor.notes.slice(1),
          ],
        },
      },
    }
    expect(
      problems(
        {
          ...values,
          week: { ...week, questions: [changed, ...week.questions.slice(1)] },
        },
        ["Harbour Works"]
      )
    ).toEqual([
      "week.questions[0] (\"walk-me-through\").ready.answer[0].sources[0]: pull:server#9999 isn't in the body of work at c9fd3215e0a1; cite one the bundle's sources list",
      'week.questions[0] ("walk-me-through").ready.answer: 93 words; at 140 a minute against a 90-second target, write 126 to 210',
      'week.questions[0] ("walk-me-through").ready.poor.notes[0]: names Harbour Works, a real employer; the interview is for an invented one',
    ])
  })

  it("holds a cited invariant to its file, a label to no employer, and the week to what home keeps", () => {
    const values = valuesFor(bundle)
    const week = values.week!
    const first = week.questions[0]!
    const [part, ...rest] = first.ready.answer
    const changed = {
      ...first,
      ready: {
        ...first.ready,
        answer: [
          {
            ...part!,
            label: "At Harbour Works",
            sources: [
              { kind: "invariant", id: "RS1", path: "REVIEW.md" } as const,
            ],
          },
          ...rest,
        ],
      },
    }
    expect(
      problems(
        {
          ...values,
          week: { ...week, questions: [changed, ...week.questions.slice(1)] },
        },
        ["Harbour Works"]
      )
    ).toEqual([
      'week.questions[0] ("walk-me-through").ready.answer[0].sources[0]: invariant:RS1 is in CLAUDE.md, not REVIEW.md',
      'week.questions[0] ("walk-me-through").ready.answer[0].label: names Harbour Works, a real employer; the interview is for an invented one',
    ])
    // A cue is one long word, so every count passes and only the weight doesn't.
    const heavy = week.questions.map((q) => ({
      ...q,
      ready: {
        ...q.ready,
        cues: Array.from({ length: 8 }, () => "x".repeat(2000)),
      },
    }))
    expect(
      problems({ ...values, week: { ...week, questions: heavy } })
    ).toEqual([
      expect.stringMatching(
        /^the week is \d+ bytes, and home keeps one of at most 65536/
      ),
    ])
  })

  it("refuses a real employer, the owner's own included, and a company an earlier week used", () => {
    const values = valuesFor(bundle)
    const week = values.week!
    const named = problems(
      {
        ...values,
        week: {
          ...week,
          company: { ...week.company, name: "Google" },
          questions: [
            {
              ...week.questions[0]!,
              prompt: "Why leave Harbour Works for us?",
            },
            ...week.questions.slice(1),
          ],
          cards: [
            week.cards[0]!,
            {
              ...week.cards[1]!,
              script: `${script(19)}\nIt runs on Cloudflare, unlike at Stripe.`,
            },
            ...week.cards.slice(2),
          ],
        },
      },
      ["Harbour Works"]
    )
    expect(named).toEqual([
      "week.company.name: names Google, a real employer; the interview is for an invented one",
      'week.questions[0] ("walk-me-through").prompt: names Harbour Works, a real employer; the interview is for an invented one',
      'week.cards[1] ("epic-2931").script: names Stripe, a real employer',
    ])
    const earlier = {
      ...bundle,
      next: { ...bundle.next!, earlierCompanies: ["Tidewell"] },
    }
    const again = finish({ bundle: earlier, values, resumeEmployers: [] })
    expect(again.ok ? [] : again.problems).toEqual([
      'week.company.name: "Tidewell" was an earlier week\'s; invent a new one',
    ])
  })

  it("writes nothing when nothing is owed, and refuses words for no week", () => {
    const held = { ...bundle, next: null }
    expect(
      finish({
        bundle: held,
        values: { schema: VALUES_SCHEMA, week: null },
        resumeEmployers: [],
      })
    ).toEqual({ ok: true, files: [] })
    expect(
      finish({ bundle: held, values: valuesFor(bundle), resumeEmployers: [] })
        .ok
    ).toBe(false)
    expect(problems({ ...valuesFor(bundle), score: 3 })).not.toEqual([])
  })
})
