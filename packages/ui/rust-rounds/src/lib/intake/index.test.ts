import type { RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import { INDEXING_01, INDEXING_01_NOTES } from "@rust-rounds/lib/worked-example"
import { WORKED_LOG } from "@rust-rounds/lib/worked-example/fixture"
import { describe, expect, it } from "vitest"

const NO_LOG: RoundLog = { schema: LOG_SCHEMA, sessions: [] }

const block = (value: unknown): string =>
  `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``

const reply = (...values: Array<unknown>): string =>
  ["Here is the next round.", ...values.map(block), "Have fun."].join("\n\n")

/** The worked example, under an id the worked log has not played. */
const NEXT = { ...INDEXING_01, id: "indexing-02" }
const NEXT_NOTES = { ...INDEXING_01_NOTES, round: "indexing-02" }

const [READ, ...REST] = INDEXING_01.cards
if (READ?.kind !== "read") throw new Error("the worked example changed shape")
const [CHOICE] = READ.choices
if (CHOICE === undefined) throw new Error("the worked example changed shape")

/** The worked example's round with its first choice replaced; it may be malformed. */
const withFirstChoice = (choice: object): unknown => ({
  ...INDEXING_01,
  cards: [{ ...READ, choices: [choice, ...READ.choices.slice(1)] }, ...REST],
})

/** The violations of a reply the intake refused; fails the test if it took it. */
function refusal(text: string, log: RoundLog = NO_LOG): Array<string> {
  const intake = intakeReply(text, log)
  if (intake.ok) throw new Error("the intake took the reply")
  for (const violation of intake.violations) {
    expect(intake.fixRequest).toContain(`- ${violation}\n`)
  }
  return intake.violations
}

describe("intakeReply", () => {
  it("takes a round and its notes from fenced blocks inside prose", () => {
    expect(intakeReply(reply(NEXT, NEXT_NOTES), WORKED_LOG)).toEqual({
      ok: true,
      round: NEXT,
      notes: NEXT_NOTES,
      findings: [],
    })
  })

  it("takes the round and notes as one bare JSON array", () => {
    const both = intakeReply(
      JSON.stringify([INDEXING_01, INDEXING_01_NOTES]),
      NO_LOG
    )
    expect(both).toMatchObject({ ok: true, notes: INDEXING_01_NOTES })
  })

  it("takes a round without notes, reporting that they are missing", () => {
    expect(intakeReply(JSON.stringify(INDEXING_01), NO_LOG)).toEqual({
      ok: true,
      round: INDEXING_01,
      notes: null,
      findings: [{ kind: "no-tutor-notes" }],
    })
  })

  it("refuses a reply with no round, with a fix request saying so", () => {
    const violations = refusal("Sorry, I can't help with that.")
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/^No round found/)
  })

  it("refuses two rounds, or two sets of notes", () => {
    expect(refusal(reply(INDEXING_01, NEXT, INDEXING_01_NOTES))).toEqual([
      "The reply holds 2 rounds: send exactly one.",
    ])
    expect(
      refusal(reply(INDEXING_01, INDEXING_01_NOTES, INDEXING_01_NOTES))
    ).toEqual([
      "The reply holds 2 sets of tutor notes: send exactly one, rewritten whole.",
    ])
  })

  it("refuses a round whose id the log already played", () => {
    expect(refusal(reply(INDEXING_01, INDEXING_01_NOTES), WORKED_LOG)).toEqual([
      'round id: "indexing-01" is a round the log already played; give this round a new id, never reused.',
    ])
  })

  it("refuses a graded choice, telling the tutor the app never grades", () => {
    const graded = withFirstChoice({ ...CHOICE, correct: true })
    expect(refusal(reply(graded, INDEXING_01_NOTES))).toEqual([
      'round cards[0] ("a").choices[0]: remove `correct`. Rust Rounds never grades: no choice is right or wrong, and no card carries a rubric or a score.',
    ])
  })

  it("refuses a choice with no `say`, naming where", () => {
    const { say: _say, ...pickOnly } = CHOICE
    expect(refusal(reply(withFirstChoice(pickOnly)))).toEqual([
      'round cards[0] ("a").choices[0].say: every choice needs its `say`: the sentence picking it asks the owner to say',
    ])
  })

  it("refuses malformed notes, and notes written with another round", () => {
    const { by: _by, ...noBy } = INDEXING_01_NOTES
    expect(refusal(reply(INDEXING_01, noBy))[0]).toMatch(/^tutor notes by:/)
    const stale = { ...INDEXING_01_NOTES, round: "indexing-00" }
    expect(refusal(reply(INDEXING_01, stale))).toEqual([
      'tutor notes round: "indexing-00" must be the id of the round it travels with, "indexing-01".',
    ])
  })

  it("refuses a round with no schema tag", () => {
    const { schema: _schema, ...untagged } = INDEXING_01
    expect(refusal(reply(untagged))[0]).toMatch(/^round schema:/)
  })
})
