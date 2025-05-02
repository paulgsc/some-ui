import { useCallback, useEffect, useState } from "react"
import { cluesJson } from "@input/data/clues"
import type { CrosswordClue, CrosswordResult } from "@input/types/crossword"
import init, { CrosswordGenerator } from "some-crossword"
import { getRandomSubarray } from "some-ui-utils"
import { z } from "zod"

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

export function useCreateCrosswordWasm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crossword, setCrossword] = useState<CrosswordResult | null>(null)
  const [randomClues, setRandomClues] = useState<Array<CrosswordClue>>([])
  const [validationWarning, setValidationWarning] = useState<string | null>(
    null
  )

  const generateCrossword = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setValidationWarning(null)

    try {
      // Initialize the WASM module
      await init()

      // Create a new generator with words and max group size
      const wordList = randomClues.reduce<Array<string>>(
        (acc, curr) => [...acc, curr.word],
        []
      )
      const maxGroupSize = Math.max(1, Math.floor(wordList.length * 0.75))
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
  }, [randomClues])

  const selectWordList = useCallback(() => {
    if (randomClues.length > 0) return

    const N = Math.floor(Math.random() * 10) + 6
    const randClues = getRandomSubarray(
      cluesJson,
      Math.min(N, cluesJson.length)
    )
    setRandomClues(randClues)
  }, [cluesJson])

  useEffect(() => {
    if (randomClues.length > 0) {
      generateCrossword()
    }
  }, [randomClues, generateCrossword])

  useEffect(() => {
    selectWordList()
  }, [selectWordList])

  return {
    isLoading,
    error,
    randomClues,
    crossword,
    validationWarning,
    regenerate: generateCrossword,
  }
}
