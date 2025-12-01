import { useEffect, useMemo, useState } from "react"
import type { CanonicalUnit, GameState } from "@input/types/leetype"
import { canonicalize } from "@input/utils/leetype"

// ============================================================================
// TYPING GAME HOOK
// ============================================================================

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
}

type UseTypingGameReturn = {
  userInput: string
  rawUserInput: string
  displayCode: string
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  errors: number
  progress: number
  accuracy: number
  wpm: number
  elapsedTime: number
  handleInputChange: (input: string) => void
  reset: () => void
  start: () => void
}

export function useTypingGame({
  targetCode,
  gameState,
  onComplete,
}: UseTypingGameProps): UseTypingGameReturn {
  const [rawUserInput, setRawUserInput] = useState("")
  const [errors, setErrors] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Canonicalize target code once
  const targetUnits = useMemo(() => canonicalize(targetCode), [targetCode])

  // Canonicalize user input on every change
  const userUnits = useMemo(() => canonicalize(rawUserInput), [rawUserInput])

  const handleInputChange = (input: string) => {
    if (gameState !== "playing") return

    const newUnits = canonicalize(input)
    const previousUnits = userUnits

    // Check only newly added units for errors
    if (newUnits.length > previousUnits.length) {
      for (let i = previousUnits.length; i < newUnits.length; i++) {
        const expected = targetUnits[i]
        const actual = newUnits[i]

        // Check if we've exceeded target length
        if (!expected) {
          setErrors((e) => e + 1)
          continue
        }

        // Check for unit mismatch
        if (expected.kind !== actual.kind) {
          setErrors((e) => e + 1)
          continue
        }

        // Check character mismatch
        if (
          expected.kind === "char" &&
          actual.kind === "char" &&
          expected.value !== actual.value
        ) {
          setErrors((e) => e + 1)
        }
      }
    }

    setRawUserInput(input)
  }

  const reset = () => {
    setRawUserInput("")
    setErrors(0)
    setStartTime(null)
  }

  const start = () => {
    setRawUserInput("")
    setErrors(0)
    setStartTime(Date.now())
  }

  // Check for completion
  useEffect(() => {
    if (
      gameState === "playing" &&
      userUnits.length > 0 &&
      userUnits.length === targetUnits.length
    ) {
      // Verify all units match before completing
      const allMatch = userUnits.every((unit, i) => {
        const target = targetUnits[i]
        if (unit.kind !== target.kind) return false
        if (unit.kind === "char" && target.kind === "char") {
          return unit.value === target.value
        }
        return true
      })

      if (allMatch) {
        onComplete()
      }
    }
  }, [userUnits, targetUnits, gameState, onComplete])

  // Calculate statistics
  const progress =
    targetUnits.length > 0 ? (userUnits.length / targetUnits.length) * 100 : 0

  // Count actual characters typed (excluding separators)
  const charsTyped = userUnits.filter((u) => u.kind === "char").length
  const totalChars = targetUnits.filter((u) => u.kind === "char").length

  const accuracy =
    charsTyped > 0
      ? Math.max(0, ((charsTyped - errors) / charsTyped) * 100)
      : 100

  const elapsedTime = startTime
    ? Math.floor((Date.now() - startTime) / 1000)
    : 0

  // WPM based on actual characters, not whitespace
  const wpm =
    elapsedTime > 0 ? Math.floor(charsTyped / 5 / (elapsedTime / 60)) : 0

  return {
    userInput: rawUserInput,
    rawUserInput,
    displayCode: targetCode,
    targetUnits,
    userUnits,
    errors,
    progress,
    accuracy,
    wpm,
    elapsedTime,
    handleInputChange,
    reset,
    start,
  }
}
