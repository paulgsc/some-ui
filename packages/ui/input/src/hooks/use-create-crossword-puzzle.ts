import { useCallback } from "react"
import type { CreateCrosswordReturnType } from "@input/lib/crossword-grid"
import { createCrossword } from "@input/lib/crossword-grid"

export function useCreateCrosswordPuzzle(
  words: Array<string>
): CreateCrosswordReturnType {
  const getCrossword = useCallback(() => createCrossword(words, 10), [words])

  return getCrossword()
}
