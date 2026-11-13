import { prepare } from "@interview-week/lib/monday/bundle"
import { finish } from "@interview-week/lib/monday/finish"
import { readWeek } from "@interview-week/lib/week"
import { describe, expect, it } from "vitest"

import { corpus, script, valuesFor } from "./fixture"

const { bundle } = prepare({
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
  it("builds the week the bundle chose, with the model's words, and it reads", () => {
    const done = finish({
      bundle,
      values: valuesFor(bundle),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    const [file] = done.files
    expect(file?.name).toBe("interview-week-2026-w47.json")
    expect(readWeek(file?.body).ok).toBe(true)
    expect(file?.body.questions[4]?.source).toEqual({
      kind: "call",
      id: "C266",
    })
    // 200 words at 150 a minute.
    expect(file?.body.cards.map((c) => c.targetSeconds)).toEqual([80, 80, 80])
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
          cards: [...week.cards, week.cards[0]!],
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
      { ...week.cards[0]!, script: script(5) },
      { ...week.cards[1]!, script: script(20).replaceAll("\n", " ") },
      week.cards[2]!,
    ]
    expect(problems({ ...values, week: { ...week, cards } })).toEqual([
      'week.cards[0] ("epic-2931").script: 50 words; write 150 to 300',
      'week.cards[1] ("doc-asks").script, line 1: 200 words; break a line where a breath belongs, at most 30 words',
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
            {
              ...week.cards[0]!,
              script: `${script(19)}\nIt runs on Cloudflare, unlike at Stripe.`,
            },
            ...week.cards.slice(1),
          ],
        },
      },
      ["Harbour Works"]
    )
    expect(named).toEqual([
      "week.company.name: names Google, a real employer; the interview is for an invented one",
      'week.questions[0] ("walk-me-through").prompt: names Harbour Works, a real employer; the interview is for an invented one',
      'week.cards[0] ("epic-2931").script: names Stripe, a real employer',
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
        values: { schema: "some-ui.interview-monday-values/1", week: null },
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
