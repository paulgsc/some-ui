import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { describe, expect, it } from "vitest"

import {
  fencedBodies,
  intakeLesson,
  LOCAL_LESSON_PREFIX,
  topikLevelOf,
} from "."

const entry = {
  key: "first-dinner",
  displayName: "The first family dinner",
  description: "Seo-yeon meets Chairman Kang.",
  batchCount: 99,
  totalQuestions: 99,
  totalMessages: 99,
  difficulty: "advanced",
  tags: ["topik-2", "makjang"],
}

const reply = (lesson: unknown): string =>
  [
    "Here is your lesson.",
    "```json",
    JSON.stringify(lesson, null, 2),
    "```",
    "And its manifest entry:",
    "```json",
    JSON.stringify(entry),
    "```",
  ].join("\n")

describe("intakeLesson", () => {
  it("takes a given entry in place of the reply's, and still derives counts", () => {
    const intake = intakeLesson(JSON.stringify(FIXTURE_BATCHES), {
      key: "week-40",
      displayName: "Edited",
      description: "From the CRM's form.",
      tags: ["topik-4"],
    })
    if (!intake.ok) throw new Error(intake.error)
    expect(intake.meta).toEqual({
      key: `${LOCAL_LESSON_PREFIX}week-40`,
      displayName: "Edited",
      description: "From the CRM's form.",
      batchCount: 2,
      totalQuestions: intake.meta.totalQuestions,
      totalMessages: intake.meta.totalMessages,
      difficulty: "intermediate",
      tags: ["topik-4"],
    })
    // The reply's own entry is ignored when one is given.
    const overridden = intakeLesson(reply(FIXTURE_BATCHES), {
      displayName: "Mine",
    })
    if (!overridden.ok) throw new Error(overridden.error)
    expect(overridden.meta.displayName).toBe("Mine")
    expect(overridden.meta.tags).toBeUndefined()
  })

  it("finds the lesson in a model's reply, and recounts rather than trusting it", () => {
    const intake = intakeLesson(reply(FIXTURE_BATCHES))
    if (!intake.ok) throw new Error(intake.error)
    expect(intake.batches).toHaveLength(2)
    expect(intake.meta).toEqual({
      key: `${LOCAL_LESSON_PREFIX}first-dinner`,
      displayName: "The first family dinner",
      description: "Seo-yeon meets Chairman Kang.",
      batchCount: 2,
      totalQuestions: 4,
      totalMessages: 6,
      // The level tag decides, over a mislabelled difficulty.
      difficulty: "beginner",
      tags: ["topik-2", "makjang"],
    })
  })

  it("takes bare JSON too, and names a lesson that came without an entry", () => {
    const intake = intakeLesson(JSON.stringify(FIXTURE_BATCHES))
    if (!intake.ok) throw new Error(intake.error)
    expect(intake.meta.key).toBe(`${LOCAL_LESSON_PREFIX}untitled-lesson`)
  })

  it("sends back a lesson whose conversation or line ids repeat", () => {
    const [one, two] = structuredClone(FIXTURE_BATCHES)
    if (!one || !two) throw new Error("fixture lost a conversation")
    expect(intakeLesson(reply([one, { ...two, id: one.id }]))).toEqual({
      ok: false,
      error: expect.stringMatching(
        /can't be played: conversation id 1 is used by more than one/
      ),
    })
    const [line] = one.messages
    if (!line) throw new Error("fixture lost a line")
    expect(
      intakeLesson(reply([{ ...one, messages: [...one.messages, line] }, two]))
    ).toEqual({
      ok: false,
      error: expect.stringMatching(
        /can't be played: conversation 1: line id ".+" is used by more than one line/
      ),
    })
  })

  it("refuses a reply with no lesson, or one the schema cannot read", () => {
    expect(intakeLesson("Sorry, I can't help with that.")).toEqual({
      ok: false,
      error: expect.stringMatching(/No lesson found/),
    })
    expect(intakeLesson('```json\n[{"id": 1}]\n```')).toEqual({
      ok: false,
      error: expect.stringMatching(/doesn't match the schema/),
    })
    expect(intakeLesson("[]")).toEqual({
      ok: false,
      error: "The lesson has no conversations.",
    })
  })
})

describe("topikLevelOf", () => {
  it("reads the level tag", () => {
    expect(topikLevelOf(["makjang", "topik-4"])).toBe(4)
    expect(topikLevelOf(["topik-9"])).toBeUndefined()
  })
})

describe("fencedBodies", () => {
  // The pattern the scan replaced. Kept here only as the reference the scan
  // must agree with on ordinary input; it is not safe on hostile input.
  const OLD_FENCE = /```(?:json)?\s*\n([\s\S]*?)```/g
  const oldBodies = (text: string): Array<string> =>
    [...text.matchAll(OLD_FENCE)].map((match) => match[1] ?? "")

  it("finds exactly the fences the old pattern did", () => {
    const cases = [
      "no fences",
      "```json\n[1]\n```",
      "```\n[1]\n```\ntext\n```json\n{}\n```",
      "```json  \r\n[1]\n```",
      "```json\n[1]",
      "```ts\nconst x = 1\n```\n```json\n[2]\n```",
      [
        "intro",
        "```json",
        "[1]",
        "```",
        "```ts",
        "const x = 1",
        "```",
        "```  ",
        '{"a":2}',
        "```",
      ].join("\n"),
    ]
    for (const text of cases) {
      expect(fencedBodies(text), text).toEqual(oldBodies(text))
    }
  })

  it("stays linear on the input that made the old pattern backtrack", () => {
    const hostile = `\`\`\`\n${"\n ".repeat(100_000)}`
    const started = performance.now()
    expect(fencedBodies(hostile)).toEqual([])
    expect(intakeLesson(hostile)).toMatchObject({ ok: false })
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
