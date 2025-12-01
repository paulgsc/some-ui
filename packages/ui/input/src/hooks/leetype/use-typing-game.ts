import { useEffect, useState } from "react"
import type { GameState } from "@input/types/leetype"

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
}

export function useTypingGame({
  targetCode,
  gameState,
  onComplete,
}: UseTypingGameProps) {
  const [userInput, setUserInput] = useState("")
  const [errors, setErrors] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Normalize for comparison: remove leading whitespace per line, collapse empty lines
  const normalizeForComparison = (code: string): string => {
    return code
      .split("\n")
      .map((line) => line.trimStart()) // Remove only leading whitespace
      .filter((line) => line.length > 0 || code.split("\n").indexOf(line) === 0) // Keep first line even if empty
      .join("\n")
  }

  const normalizedTargetCode = normalizeForComparison(targetCode)

  const handleInputChange = (input: string) => {
    if (gameState !== "playing") return

    const normalizedInput = normalizeForComparison(input)

    // Count errors only on new characters
    if (normalizedInput.length > userInput.length) {
      const newCharIndex = normalizedInput.length - 1
      const expectedChar = normalizedTargetCode[newCharIndex]
      const actualChar = normalizedInput[newCharIndex]

      if (actualChar !== expectedChar) {
        setErrors((prev) => prev + 1)
      }
    }

    setUserInput(normalizedInput)
  }

  const reset = () => {
    setUserInput("")
    setErrors(0)
    setStartTime(null)
  }

  const start = () => {
    setUserInput("")
    setErrors(0)
    setStartTime(Date.now())
  }

  // Check completion
  useEffect(() => {
    if (gameState === "playing" && userInput === normalizedTargetCode) {
      onComplete()
    }
  }, [userInput, normalizedTargetCode, gameState, onComplete])

  // Calculate stats
  const progress =
    normalizedTargetCode.length > 0
      ? (userInput.length / normalizedTargetCode.length) * 100
      : 0

  const accuracy =
    userInput.length > 0
      ? ((userInput.length - errors) / userInput.length) * 100
      : 100

  const elapsedTime = startTime
    ? Math.floor((Date.now() - startTime) / 1000)
    : 0

  const wpm =
    elapsedTime > 0 ? Math.floor(userInput.length / 5 / (elapsedTime / 60)) : 0

  return {
    userInput,
    displayCode: targetCode, // Original code for display
    normalizedCode: normalizedTargetCode, // Normalized for comparison
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
