import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import { describe, expect, it } from "vitest"

import { buildLessonPrompt, LESSON_PROMPT, surveyDigest } from "."

const report = (extra: Partial<SurveyReport>): SurveyReport => ({
  topikKey: "local:first-dinner",
  at: 1,
  stuck: [],
  ...extra,
})

describe("surveyDigest", () => {
  it("describes recent lessons in words, with the probe text rather than ids", () => {
    const digest = surveyDigest([
      report({
        displayName: "The first family dinner",
        worthwhile: "yes",
        difficulty: "too-hard",
        enthusiasm: "drained",
        stuck: [
          {
            batchId: 2,
            probeId: "c2-x",
            source: "카드로 할게요.",
            prompt: "Which is NOT a valid transformation?",
          },
        ],
        flagged: [{ batchId: 1, probeId: "c1-y", source: "포장해 주세요." }],
        becoming: "following a drama without subtitles",
      }),
      report({ topikKey: "local:older", worthwhile: "somewhat" }),
    ])
    expect(digest).toBe(
      [
        "1. The first family dinner: worthwhile; felt too hard; running out of steam.",
        '   Blocking: 카드로 할게요. ("Which is NOT a valid transformation?")',
        "   Flagged as keyed wrong: 포장해 주세요.",
        '   Making them into: "following a drama without subtitles"',
        "2. local:older: somewhat worthwhile.",
      ].join("\n")
    )
  })

  it("keeps only the most recent lessons: the delta, not the path", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      report({ topikKey: `k${i}`, worthwhile: "yes" })
    )
    expect(surveyDigest(many, 3).split("\n")).toHaveLength(3)
    expect(surveyDigest([])).toBe("")
  })
})

describe("buildLessonPrompt", () => {
  it("appends the request to the self-contained prompt", () => {
    const prompt = buildLessonPrompt({
      level: 2,
      scene: "the fiancée meets his mother",
      survey: "1. Lesson: worthwhile.",
    })
    expect(prompt.startsWith(LESSON_PROMPT.trimEnd())).toBe(true)
    expect(prompt).toContain(
      [
        "## This request",
        "",
        "Level: 2",
        "Scene: the fiancée meets his mother",
        "Conversations: 3",
        "",
        "Survey (newest first):",
        "1. Lesson: worthwhile.",
      ].join("\n")
    )
  })

  it("says so when there is no survey yet, and lets the model invent a scene", () => {
    const prompt = buildLessonPrompt({ level: 1, scene: "  " })
    expect(prompt).toContain("Scene: (invent one)")
    expect(prompt).toContain("Survey: none yet")
  })

  it("ships a prompt that points at nothing outside itself", () => {
    // The learner pastes it into any model; the repo is not there.
    expect(LESSON_PROMPT).not.toMatch(/packages\/|pnpm |canon |cargo /)
    expect(LESSON_PROMPT).toContain("## Output")
  })
})
