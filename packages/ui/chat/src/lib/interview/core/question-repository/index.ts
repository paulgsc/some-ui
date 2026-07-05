import {
  QuestionSchema,
  type Question,
  type QuestionRepository,
} from "@chat/lib/interview/core/interview-types"

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
 * Serves questions from a static in-memory bank. This is the default today
 * (see `src/data/interview-questions.ts`). `createHttpQuestionRepository`
 * is the drop-in replacement once a question bank endpoint exists.
 */
export const createStaticQuestionRepository = (
  questions: Array<Question>
): QuestionRepository => ({
  list(filters): Promise<Array<Question>> {
    return Promise.resolve(questions.filter((q) => matches(q, filters)))
  },
})

type HttpQuestionRepositoryOptions = {
  baseUrl: string
  headers?: Record<string, string>
}

export const createHttpQuestionRepository = (
  options: HttpQuestionRepositoryOptions
): QuestionRepository => {
  const { baseUrl, headers = {} } = options

  return {
    async list(filters): Promise<Array<Question>> {
      const params = new URLSearchParams()
      if (filters?.level) params.set("level", filters.level)
      if (filters?.category) params.set("category", filters.category)

      const query = params.toString()
      const response = await fetch(
        `${baseUrl}/questions${query ? `?${query}` : ""}`,
        { headers }
      )

      if (!response.ok) {
        throw new Error(`Failed to load questions: ${response.status}`)
      }

      return QuestionSchema.array().parse(await response.json())
    },
  }
}
