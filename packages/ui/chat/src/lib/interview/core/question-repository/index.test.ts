import type { Question } from "@chat/lib/interview/core/interview-types"
import { describe, expect, it } from "vitest"

import { createStaticQuestionRepository } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    level: "junior",
    category: "behavioral",
    question: "Tell me about yourself.",
    durationSeconds: 60,
    ...overrides,
  }
}

const questions: Array<Question> = [
  makeQuestion({
    id: "junior-behavioral",
    level: "junior",
    category: "behavioral",
  }),
  makeQuestion({
    id: "junior-technical",
    level: "junior",
    category: "technical",
  }),
  makeQuestion({
    id: "senior-behavioral",
    level: "senior",
    category: "behavioral",
  }),
  makeQuestion({
    id: "senior-system-design",
    level: "senior",
    category: "system-design",
  }),
]

// ═══════════════════════════════════════════════════════════════════════════
// createStaticQuestionRepository - level/category filtering
// ═══════════════════════════════════════════════════════════════════════════

describe("createStaticQuestionRepository - filtering", () => {
  it.each([
    {
      name: "no filter returns every question",
      filters: undefined,
      expectedIds: questions.map((q) => q.id),
    },
    {
      name: "level-only filter",
      filters: { level: "junior" as const },
      expectedIds: ["junior-behavioral", "junior-technical"],
    },
    {
      name: "category-only filter",
      filters: { category: "behavioral" as const },
      expectedIds: ["junior-behavioral", "senior-behavioral"],
    },
    {
      name: "combined level+category filter",
      filters: { level: "senior" as const, category: "behavioral" as const },
      expectedIds: ["senior-behavioral"],
    },
    {
      name: "combined filter matching nothing",
      filters: { level: "mid" as const, category: "leadership" as const },
      expectedIds: [],
    },
  ])("$name", async ({ filters, expectedIds }) => {
    const repo = createStaticQuestionRepository(questions)
    const result = await repo.list(filters)
    expect(result.map((q) => q.id)).toEqual(expectedIds)
  })
})
