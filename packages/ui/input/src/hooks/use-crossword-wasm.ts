import { useCallback, useEffect, useState } from "react"
import type { CrosswordResult } from "@input/types/crossword"
import init, { CrosswordGenerator } from "some-crossword"

export function useCreateCrosswordWasm(
  wordList: Array<string> = [],
  maxGroupSize: number = 8
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [crossword, setCrossword] = useState<CrosswordResult | null>(null)

  const generateCrossword = useCallback(async () => {
    if (wordList.length === 0) {
      setError("Please add at least one word")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Initialize the WASM module
      await init()

      // Create a new generator with words and max group size
      const generator = new CrosswordGenerator(wordList, maxGroupSize)

      // Generate the crossword
      const result = await generator.generate()

      // Set the result to state
      setCrossword(result)

      setIsLoading(false)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
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
  }
}
