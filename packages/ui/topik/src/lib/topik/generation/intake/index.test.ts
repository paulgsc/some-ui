import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { relationTags } from "@topik/lib/topik/core/lesson-selection"
import { describe, expect, it } from "vitest"

import { fixRequest, intakeLesson, LOCAL_LESSON_PREFIX, topikLevelOf } from "."

const entry = {
  key: "first-dinner",
  displayName: "The first family dinner",
  description: "Seo-yeon meets Chairman Kang.",
  batchCount: 99,
  totalQuestions: 99,
  totalMessages: 99,
  difficulty: "advanced",
  // The model's own relation tag is dropped: the app derives them.
  tags: ["topik-2", "makjang", "relation:invented"],
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
      tags: ["topik-2", "makjang", ...relationTags(FIXTURE_BATCHES)],
    })
    expect(relationTags(FIXTURE_BATCHES)).toContain("relation:negation")
    expect(intake.meta.tags).not.toContain("relation:invented")
    expect(intake.findings).toEqual([])
  })

  it("takes bare JSON too, and names a lesson that came without an entry", () => {
    const intake = intakeLesson(JSON.stringify(FIXTURE_BATCHES))
    if (!intake.ok) throw new Error(intake.error)
    expect(intake.meta.key).toBe(`${LOCAL_LESSON_PREFIX}untitled-lesson`)
  })

  it("reports the probes the lesson would drop, and still takes the lesson", () => {
    const broken = structuredClone(FIXTURE_BATCHES)
    const first = broken[0]?.probes?.[0]
    if (first) first.anchorMessageId = "nowhere"
    const intake = intakeLesson(reply(broken))
    if (!intake.ok) throw new Error(intake.error)
    expect(intake.findings).toEqual([
      expect.objectContaining({
        probe: "c1-reply",
        severity: "error",
        message: expect.stringMatching(/"nowhere"/),
      }),
    ])
    expect(fixRequest(intake.findings)).toMatch(
      /Fix them and return the whole lesson[\s\S]*- error: conversation 1, probe c1-reply:/
    )
  })

  it("withholds a probe an error names, and does not tag what it withheld", () => {
    const flawed = structuredClone(FIXTURE_BATCHES)
    const probe = flawed[0]?.probes?.find(
      (candidate) => candidate.id === "c1-build-negation"
    )
    if (probe?.kind !== "build" || !probe.source) {
      throw new Error("fixture lost c1-build-negation")
    }
    // A relation only this probe uses, and an error: its target is its source.
    probe.relation = "honorific lowering"
    probe.target = probe.source
    const intake = intakeLesson(reply(flawed))
    if (!intake.ok) throw new Error(intake.error)
    const played = intake.batches.flatMap((batch) =>
      (batch.probes ?? []).map((candidate) => candidate.id)
    )
    expect(played).not.toContain("c1-build-negation")
    expect(played).toContain("c1-request-forms")
    expect(intake.meta.tags).not.toContain("relation:honorific lowering")
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
