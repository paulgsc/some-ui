import type { RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import {
  INDEXING_01,
  INDEXING_01_NOTES,
  WORKED_LOG,
} from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const NO_LOG: RoundLog = { schema: LOG_SCHEMA, sessions: [] }

const block = (value: unknown): string =>
  `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``

const reply = (...values: Array<unknown>): string =>
  ["Here is the next round.", ...values.map(block), "Have fun."].join("\n\n")

const [READ, ...REST] = INDEXING_01.cards
if (READ?.kind !== "read") throw new Error("the worked example changed shape")
const [CHOICE] = READ.choices
if (CHOICE === undefined) throw new Error("the worked example changed shape")

/** The worked example's round with its first choice replaced; it may be malformed. */
const withFirstChoice = (choice: object): unknown => ({
  ...INDEXING_01,
  cards: [{ ...READ, choices: [choice, ...READ.choices.slice(1)] }, ...REST],
})

describe("intakeReply", () => {
  it("takes a round and its notes from fenced blocks inside prose", () => {
    const intake = intakeReply(
      reply(INDEXING_01, INDEXING_01_NOTES),
      WORKED_LOG
    )
    expect(intake).toEqual({
      ok: true,
      round: INDEXING_01,
      notes: INDEXING_01_NOTES,
      findings: [],
    })
  })

  it("takes bare JSON: a round alone, or the round and notes as an array", () => {
    const alone = intakeReply(JSON.stringify(INDEXING_01), NO_LOG)
    expect(alone).toMatchObject({ ok: true, notes: null })
    const both = intakeReply(
      JSON.stringify([INDEXING_01, INDEXING_01_NOTES]),
      NO_LOG
    )
    expect(both).toMatchObject({ ok: true, notes: INDEXING_01_NOTES })
  })

  it("takes a round the lint has findings on, with the findings", () => {
    const wide = {
      ...INDEXING_01,
      cards: [
        { ...READ, program: `// ${"x".repeat(60)}\n${READ.program}` },
        ...REST,
      ],
    }
    const intake = intakeReply(reply(wide), NO_LOG)
    expect(intake.ok).toBe(true)
    if (!intake.ok) return
    expect(intake.findings.map((finding) => finding.kind)).toEqual([
      "line-too-wide",
    ])
  })

  it("refuses a reply with no round, with a fix request saying so", () => {
    const intake = intakeReply("Sorry, I can't help with that.", NO_LOG)
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    const [violation] = intake.violations
    expect(intake.violations).toHaveLength(1)
    expect(violation).toMatch(/No round found/)
    expect(intake.fixRequest).toContain(`- ${String(violation)}`)
  })

  it("refuses a graded choice, telling the tutor the app never grades", () => {
    const graded = withFirstChoice({ ...CHOICE, correct: true })
    const intake = intakeReply(reply(graded, INDEXING_01_NOTES), NO_LOG)
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    expect(intake.violations).toEqual([
      'round cards[0] ("a").choices[0]: remove `correct`. Rust Rounds never grades: no choice is right or wrong, and no card carries a rubric or a score.',
    ])
    expect(intake.fixRequest).toMatch(/^Rust Rounds checked your reply/)
    expect(intake.fixRequest).toContain(`- ${String(intake.violations[0])}\n`)
  })

  it("refuses a choice with no `say`, naming where", () => {
    const { say: _say, ...pickOnly } = CHOICE
    const silent = withFirstChoice(pickOnly)
    const intake = intakeReply(reply(silent), NO_LOG)
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    expect(intake.violations).toEqual([
      'round cards[0] ("a").choices[0].say: every choice needs its `say`: the sentence picking it asks the owner to say',
    ])
  })

  it("refuses malformed notes, and notes written with another round", () => {
    const { by: _by, ...noBy } = INDEXING_01_NOTES
    const broken = intakeReply(reply(INDEXING_01, noBy), NO_LOG)
    expect(broken.ok).toBe(false)
    if (broken.ok) return
    expect(broken.violations[0]).toMatch(/^tutor notes by:/)

    const stale = intakeReply(
      reply(INDEXING_01, { ...INDEXING_01_NOTES, round: "indexing-00" }),
      NO_LOG
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.violations).toEqual([
      'tutor notes round: "indexing-00" must be the id of the round it travels with, "indexing-01".',
    ])
  })

  it("refuses a round with no schema tag", () => {
    const { schema: _schema, ...untagged } = INDEXING_01
    const intake = intakeReply(reply(untagged), NO_LOG)
    expect(intake.ok).toBe(false)
    if (intake.ok) return
    expect(intake.violations[0]).toMatch(/^round schema:/)
  })
})
