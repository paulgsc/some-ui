import { useCallback, useEffect, useState } from "react"
import type { CrosswordResult } from "@input/types/crossword"
import init, { CrosswordGenerator } from "some-crossword"
import { z } from "zod"

// Define Zod schemas for input validation
const WordListSchema = z.array(z.string().trim().min(1)).min(1, {
  message: "Please add at least one word",
})

const MaxGroupSizeSchema = z.number().positive().int()

const CrosswordInputSchema = z.object({
  wordList: WordListSchema,
  maxGroupSize: MaxGroupSizeSchema.optional(),
})

// Define Zod schemas for result validation
const WordPlacementSchema = z.object({
  word: z.string(),
  start_x: z.number().int(),
  start_y: z.number().int(),
  is_across: z.boolean(),
  group_id: z.number().int().nullable(),
  clue_num: z.number().int(),
})

const CrosswordResultSchema = z.object({
  grid: z.array(z.string()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  word_placements: z.array(WordPlacementSchema),
})

export function useCreateCrosswordWasm(
  wordList: Array<string> = [],
  maxGroupSize: number = Math.max(1, Math.floor(wordList.length * 0.75))
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crossword, setCrossword] = useState<CrosswordResult | null>(null)
  const [validationWarning, setValidationWarning] = useState<string | null>(
    null
  )

  const generateCrossword = useCallback(async () => {
    // Validate inputs with Zod
    try {
      CrosswordInputSchema.parse({
        wordList,
        maxGroupSize,
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMessage = validationError.errors
          .map((err) => err.message)
          .join(", ")
        setError(errorMessage)
        return
      }
    }

    setIsLoading(true)
    setError(null)
    setValidationWarning(null)

    try {
      // Initialize the WASM module
      await init()

      // Create a new generator with words and max group size
      const generator = new CrosswordGenerator(wordList, maxGroupSize)

      // Generate the crossword
      const result = await generator.generate()

      // Validate the result structure
      const validatedResult = CrosswordResultSchema.parse(result)
      setCrossword(validatedResult)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setCrossword(null)
    } finally {
      setIsLoading(false)
    }
  }, [wordList, maxGroupSize])

  useEffect(() => {
    if (wordList.length > 0) {
      generateCrossword()
    }
  }, [wordList, maxGroupSize, generateCrossword])

  return {
    isLoading,
    error,
    crossword,
    validationWarning,
    regenerate: generateCrossword,
  }
}
