import { useCallback, useEffect, useRef, useState } from "react"
import { cluesJson } from "@input/data/clues"
import type { CrosswordClue, CrosswordResult } from "@input/types/crossword"
import { CrosswordResultSchema } from "@input/types/crossword"
import { createWasmLoader } from "@some-ui/wasm-loader"
import init, { CrosswordGenerator } from "some-crossword"
import { getRandomSubarray } from "some-ui-utils"

export function useCreateCrosswordWasm(): {
  isLoading: boolean
  error: string | null
  randomClues: Array<CrosswordClue>
  crossword: CrosswordResult | null
  validationWarning: string | null
  regenerate: () => Promise<void>
} {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crossword, setCrossword] = useState<CrosswordResult | null>(null)
  const [randomClues, setRandomClues] = useState<Array<CrosswordClue>>([])
  const [validationWarning, setValidationWarning] = useState<string | null>(
    null
  )

  // Guards the setState calls below against a generate() that resolves
  // after unmount — checked, not just relied on for cleanup ordering,
  // because the wasm round-trip can easily outlive the component.
  const aliveRef = useRef(true)

  // This site has no cross-call caching - every generate() (including
  // regenerate()) re-initializes the module, so the loader is reset
  // immediately before each load() to preserve that contract while still
  // routing through the canonical substrate.
  const wasmLoaderRef = useRef(createWasmLoader({ importModule: () => init() }))

  // Engine call, parameterized on its word list instead of closing over
  // `randomClues` state — keeps this useCallback's identity permanently
  // stable ([]), so effects that call it never need to re-run just because
  // it was recreated.
  const generateCrossword = useCallback(
    async (clues: Array<CrosswordClue>): Promise<void> => {
      setIsLoading(true)
      setError(null)
      setValidationWarning(null)

      try {
        // Initialize the WASM module
        wasmLoaderRef.current.reset()
        await wasmLoaderRef.current.load()

        // Create a new generator with words and max group size
        const wordList = clues.map((clue) => clue.word)
        const maxGroupSize = Math.max(1, Math.floor(wordList.length * 0.75))
        const generator = new CrosswordGenerator(wordList, maxGroupSize)

        // Generate the crossword
        const result = await generator.generate()

        // Validate the result structure
        const validatedResult = CrosswordResultSchema.parse(result)
        if (!aliveRef.current) return
        setCrossword(validatedResult)
      } catch (err) {
        if (!aliveRef.current) return
        // eslint-disable-next-line no-console
        console.error("Error generating crossword:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
        setCrossword(null)
      } finally {
        if (aliveRef.current) setIsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    aliveRef.current = true

    void (async (): Promise<void> => {
      const N = 6
      const clues = getRandomSubarray(cluesJson, Math.min(N, cluesJson.length))
      if (!aliveRef.current) return
      setRandomClues(clues)
      await generateCrossword(clues)
    })()

    return (): void => {
      aliveRef.current = false
    }
  }, [generateCrossword])

  const regenerate = useCallback(
    (): Promise<void> => generateCrossword(randomClues),
    [generateCrossword, randomClues]
  )

  return {
    isLoading,
    error,
    randomClues,
    crossword,
    validationWarning,
    regenerate,
  }
}
