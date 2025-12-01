import { useCallback, useEffect, useMemo, useState } from "react"
import type { CanonicalUnit, GameState } from "@input/types/leetype"
import { canonicalize } from "@input/utils/leetype"

type UseTypingGameProps = {
  targetCode: string
  gameState: GameState
  onComplete: () => void
  maxConsecutiveErrors?: number
}

type UseTypingGameReturn = {
  userInput: string
  rawUserInput: string
  displayCode: string
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  errors: number
  consecutiveErrors: number
  showErrorAlert: boolean
  progress: number
  accuracy: number
  wpm: number
  elapsedTime: number
  handleInputChange: (input: string) => void
  reset: () => void
  start: () => void
  dismissWarning: () => void
}

export function useTypingGame({
  targetCode,
  gameState,
  onComplete,
  maxConsecutiveErrors = 3,
}: UseTypingGameProps): UseTypingGameReturn {
  const [rawUserInput, setRawUserInput] = useState("")
  const [errors, setErrors] = useState(0)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Canonicalize target code once
  const targetUnits = useMemo(() => canonicalize(targetCode), [targetCode])

  // Canonicalize user input on every change
  const userUnits = useMemo(() => canonicalize(rawUserInput), [rawUserInput])

  const handleInputChange = useCallback(
    (input: string) => {
      if (gameState !== "playing") return

      const newUnits = canonicalize(input)
      const previousUnits = userUnits

      // If input is shorter (backspace), reset consecutive errors
      if (newUnits.length < previousUnits.length) {
        setConsecutiveErrors(0)
        setShowErrorAlert(false)
        setRawUserInput(input)
        return
      }

      // Check if we've hit max consecutive errors - block further input
      if (consecutiveErrors >= maxConsecutiveErrors) {
        setShowErrorAlert(true)
        return // Don't allow new input, must backspace
      }

      let newConsecutiveErrors = consecutiveErrors
      let hasError = false

      // Check only newly added units for errors
      if (newUnits.length > previousUnits.length) {
        for (let i = previousUnits.length; i < newUnits.length; i++) {
          const expected = targetUnits[i]
          const actual = newUnits[i]

          // Check if we've exceeded target length
          if (!expected) {
            setErrors((e) => e + 1)
            newConsecutiveErrors++
            hasError = true
            continue
          }

          // Check for unit mismatch
          if (expected.kind !== actual.kind) {
            setErrors((e) => e + 1)
            newConsecutiveErrors++
            hasError = true
            continue
          }

          // Check character mismatch
          if (
            expected.kind === "char" &&
            actual.kind === "char" &&
            expected.value !== actual.value
          ) {
            setErrors((e) => e + 1)
            newConsecutiveErrors++
            hasError = true
          } else if (!hasError) {
            // Correct character typed, reset consecutive errors
            newConsecutiveErrors = 0
          }
        }
      }

      setConsecutiveErrors(newConsecutiveErrors)

      // Show alert if we've reached the limit
      if (newConsecutiveErrors >= maxConsecutiveErrors) {
        setShowErrorAlert(true)
      } else {
        setShowErrorAlert(false)
      }

      setRawUserInput(input)
    },
    [gameState, userUnits, targetUnits, consecutiveErrors, maxConsecutiveErrors]
  )

  const reset = useCallback(() => {
    setRawUserInput("")
    setErrors(0)
    setConsecutiveErrors(0)
    setShowErrorAlert(false)
    setStartTime(null)
  }, [])

  const start = useCallback(() => {
    setRawUserInput("")
    setErrors(0)
    setConsecutiveErrors(0)
    setShowErrorAlert(false)
    setStartTime(Date.now())
  }, [])

  const dismissWarning = useCallback(() => {
    setShowErrorAlert(false)
  }, [])
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
    consecutiveErrors,
    showErrorAlert,
    progress,
    accuracy,
    wpm,
    elapsedTime,
    handleInputChange,
    reset,
    start,
    dismissWarning,
  }
}
