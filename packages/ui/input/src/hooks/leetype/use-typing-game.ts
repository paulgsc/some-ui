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
  onDismiss: () => void
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
  const [lastValidatedLength, setLastValidatedLength] = useState(0)

  // Canonicalize target code once
  const targetUnits = useMemo(() => canonicalize(targetCode), [targetCode])

  // Canonicalize user input on every change
  const userUnits = useMemo(() => canonicalize(rawUserInput), [rawUserInput])

  const handleInputChange = useCallback(
    (input: string) => {
      if (gameState !== "playing") return

      const newUnits = canonicalize(input)
      const previousUnits = userUnits

      // If input is shorter (backspace), reset consecutive errors and validation point
      if (newUnits.length < previousUnits.length) {
        setConsecutiveErrors(0)
        setShowErrorAlert(false)
        setLastValidatedLength(Math.min(lastValidatedLength, newUnits.length))
        setRawUserInput(input)
        return
      }

      // Check if we've hit max consecutive errors - block further input
      if (consecutiveErrors >= maxConsecutiveErrors) {
        setShowErrorAlert(true)
        return // Don't allow new input, must backspace
      }

      // Helper to find token boundaries
      const findTokenStart = (
        units: Array<CanonicalUnit>,
        endIndex: number
      ): number => {
        for (let i = endIndex - 1; i >= 0; i--) {
          if (units[i].kind === "sep") {
            return i + 1
          }
        }
        return 0
      }

      const findTokenEnd = (
        units: Array<CanonicalUnit>,
        startIndex: number
      ): number => {
        for (let i = startIndex; i < units.length; i++) {
          if (units[i].kind === "sep") {
            return i
          }
        }
        return units.length
      }

      let newConsecutiveErrors = consecutiveErrors
      let totalNewErrors = 0
      let hasErrorInCurrentToken = false

      // Check newly added units
      if (newUnits.length > previousUnits.length) {
        const tokenStart = findTokenStart(newUnits, newUnits.length)
        const tokenEnd = findTokenEnd(newUnits, tokenStart)

        // Check if current token has any errors
        for (let i = tokenStart; i < tokenEnd; i++) {
          const expected = targetUnits[i]
          const actual = newUnits[i]

          // Check if we've exceeded target length
          if (!expected) {
            hasErrorInCurrentToken = true
            break
          }

          // Check for unit mismatch
          if (expected.kind !== actual.kind) {
            hasErrorInCurrentToken = true
            break
          }

          // Check character mismatch
          if (
            expected.kind === "char" &&
            actual.kind === "char" &&
            expected.value !== actual.value
          ) {
            hasErrorInCurrentToken = true
            break
          }
        }

        // If there's an error in the current token, count all characters from the error point
        if (hasErrorInCurrentToken) {
          // Count how many new characters were added since last validation
          const newCharsAdded =
            newUnits.length -
            Math.max(previousUnits.length, lastValidatedLength)

          // All new characters are errors since the token has an error
          totalNewErrors = newCharsAdded
          newConsecutiveErrors += newCharsAdded

          setErrors((e) => e + totalNewErrors)
        } else {
          // Current token is correct - check if we completed a token
          const previousTokenStart = findTokenStart(
            previousUnits,
            previousUnits.length
          )
          const currentTokenStart = findTokenStart(newUnits, newUnits.length)

          // If we've moved to a new token (typed a separator), validate the previous token
          if (
            currentTokenStart > previousTokenStart ||
            newUnits[newUnits.length - 1]?.kind === "sep"
          ) {
            // Previous token was completed successfully, reset consecutive errors
            newConsecutiveErrors = 0
            setLastValidatedLength(newUnits.length)
          }
          // Otherwise, we're still in the same token and it's correct so far
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
    [
      gameState,
      userUnits,
      targetUnits,
      consecutiveErrors,
      maxConsecutiveErrors,
      lastValidatedLength,
    ]
  )

  const reset = useCallback(() => {
    setRawUserInput("")
    setErrors(0)
    setConsecutiveErrors(0)
    setShowErrorAlert(false)
    setStartTime(null)
    setLastValidatedLength(0)
  }, [])

  const start = useCallback(() => {
    setRawUserInput("")
    setErrors(0)
    setConsecutiveErrors(0)
    setShowErrorAlert(false)
    setStartTime(Date.now())
    setLastValidatedLength(0)
  }, [])

  const onDismiss = useCallback(() => {
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
    onDismiss
  }
}
