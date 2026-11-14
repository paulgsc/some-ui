import {
  prepare,
  SITUATIONS,
  weekFileName,
} from "@interview-week/lib/monday/bundle"
import type { Bundle } from "@interview-week/lib/monday/bundle"
import { finish } from "@interview-week/lib/monday/finish"
import { describe, expect, it } from "vitest"

import { corpus, valuesFor } from "./fixture"

/** Monday 16 November 2026, 03:41 Pacific: when the routine runs. */
const MONDAY = new Date("2026-11-16T11:41:00Z")
const WEEK_MS = 7 * 86_400_000

/** The weeks the routine writes over `n` Mondays, each from the ones before. */
function run(n: number): Array<Bundle> {
  const brief: Array<{ name: string; body: unknown }> = []
  const bundles: Array<Bundle> = []
  for (let i = 0; i < n; i += 1) {
    const { bundle } = prepare({
      now: new Date(MONDAY.getTime() + i * WEEK_MS),
      brief,
      corpus,
    })
    bundles.push(bundle)
    const done = finish({
      bundle,
      values: valuesFor(bundle),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    for (const file of done.files) {
      brief.push({
        name: file.name,
        body: {
          ...file.body,
          company: { ...file.body.company, name: `Tidewell ${i}` },
        },
      })
    }
  }
  return bundles
}

describe("the interview week's choices", () => {
  it("asks one question from each family, and a decision from the newest call", () => {
    const [first] = run(1)
    expect(first?.next?.id).toBe("2026-w47")
    expect(
      first?.next?.questions.map((q) => [q.id, q.family, q.targetSeconds])
    ).toEqual([
      ["walk-me-through", "about-yourself", 90],
      ["conflict", "a-time-you", 120],
      ["why-this-role", "why-this-role", 60],
      ["strength", "strengths-weaknesses", 90],
      ["decision-c266", "decision", 120],
    ])
    expect(first?.next?.questions[4]?.call?.chose).toBe("what C266 chose")
  })

  it("rotates each family's variants and each call, least recently asked first", () => {
    const weeks = run(6).map((b) => b.next?.questions ?? [])
    expect(weeks.map((qs) => qs[1]?.variant)).toEqual([
      "conflict",
      "failure",
      "success",
      "ambiguity",
      "feedback",
      "conflict",
    ])
    expect(weeks.map((qs) => qs[4]?.id)).toEqual([
      "decision-c266",
      "decision-c265",
      "decision-c9",
      "decision-c266",
      "decision-c265",
      "decision-c9",
    ])
  })

  it("draws a card from an epic, a doc and an invariant, each in its own situation, rotated", () => {
    const weeks = run(3).map((b) => b.next?.cards ?? [])
    expect(weeks.map((cs) => cs.map((c) => c.id))).toEqual([
      ["epic-2931", "doc-asks", "invariant-rs1"],
      ["epic-server-800", "doc-ui-fit-readme", "invariant-l3"],
      ["epic-2931", "doc-asks", "invariant-rs1"],
    ])
    for (const cards of weeks) {
      expect(new Set(cards.map((c) => c.situation)).size).toBe(cards.length)
      for (const c of cards)
        expect(Object.values(SITUATIONS)).toContain(c.situation)
    }
    expect(weeks[1]?.[0]?.situation).toBe(SITUATIONS["recorded-update"])
  })

  it("tops the cards up from another kind when one has none", () => {
    const { bundle } = prepare({
      now: MONDAY,
      brief: [],
      corpus: { ...corpus, epics: [] },
    })
    expect(bundle.next?.cards.map((c) => c.id)).toEqual([
      "doc-asks",
      "invariant-rs1",
      "doc-ui-fit-readme",
    ])
  })

  it("owes nothing when the mailbox holds the week, and names a file it can't read", () => {
    const [first] = run(1)
    const done = finish({
      bundle: first!,
      values: valuesFor(first!),
      resumeEmployers: [],
    })
    if (!done.ok) throw new Error("not ready")
    const brief = [
      { name: weekFileName("2026-w47"), body: done.files[0]?.body },
      { name: weekFileName("2026-w40"), body: { schema: "nope" } },
      { name: "rust-week-2026-w47.json", body: {} },
    ]
    const { bundle } = prepare({ now: MONDAY, brief, corpus })
    expect(bundle.next).toBeNull()
    expect(bundle.unread.map((u) => u.name)).toEqual([
      "interview-week-2026-w40.json",
    ])
  })
})
