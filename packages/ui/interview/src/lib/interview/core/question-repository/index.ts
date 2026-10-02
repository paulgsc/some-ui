import type {
  Question,
  QuestionRepository,
} from "@interview/lib/interview/core/interview-types"

const matches = (
  question: Question,
  filters?: Parameters<QuestionRepository["list"]>[0]
): boolean => {
  if (!filters) return true
  if (filters.level && question.level !== filters.level) return false
  if (filters.category && question.category !== filters.category) return false
  return true
}

/**
 * Serves questions from a static in-memory bank
 * (see `src/data/interview-questions.ts`).
 */
export const createStaticQuestionRepository = (
  questions: Array<Question>
): QuestionRepository => ({
  list(filters): Promise<Array<Question>> {
    return Promise.resolve(questions.filter((q) => matches(q, filters)))
  },
})
