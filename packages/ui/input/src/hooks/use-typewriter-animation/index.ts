import { useCallback, useEffect, useRef, useState } from "react"

const DEFAULT_INVALID_LETTERS = ["x", "y", "z", "a", "b", "c"]

type TypewriterAnimationOptions = {
  validLetter: string
  invalidLetters?: Array<string>
  invalidAttempts?: number
  typingSpeed?: number
  solved: boolean
  invalidDuration?: number
  vibrationDuration?: number
  onComplete?: () => void
}

export function useTypewriterAnimation({
  validLetter,
  invalidLetters = DEFAULT_INVALID_LETTERS,
  invalidAttempts = 3,
  typingSpeed = 150,
  invalidDuration = 300,
  vibrationDuration = 300,
  solved = false,
  onComplete,
}: TypewriterAnimationOptions): {
  currentLetter: string
  isAnimating: boolean
  isValid: boolean
  isVibrating: boolean
  isHighlighted: boolean
  startAnimation: () => void
  setRef: (element: SVGSVGElement | null) => void
} {
  // --- React State ---
  const [currentLetter, setCurrentLetter] = useState<string>("")
  const [isAnimating, setIsAnimating] = useState(false)
  const [isValid, setIsValid] = useState(false)
  const [isVibrating, setIsVibrating] = useState(false)
  const [isHighlighted, setIsHighlighted] = useState(false)

  // --- Animation Engine State ---
  const animationRef = useRef<Animation | null>(null)
  const elementRef = useRef<SVGSVGElement | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAnimatingRef = useRef(false)

  // Store options in a ref to avoid dependency cycles and stale closures.
  const optionsRef = useRef({
    validLetter,
    invalidLetters,
    invalidAttempts,
    typingSpeed,
    invalidDuration,
    vibrationDuration,
    onComplete,
  })

  // Safely keep the ref strictly in sync with latest props AFTER render.
  // We omit the dependency array so this runs after every render, ensuring
  // startAnimation always has the absolute latest config.
  useEffect(() => {
    optionsRef.current = {
      validLetter,
      invalidLetters,
      invalidAttempts,
      typingSpeed,
      invalidDuration,
      vibrationDuration,
      onComplete,
    }
  })

  const setRef = useCallback((element: SVGSVGElement | null): void => {
    elementRef.current = element
  }, [])

  // Stable cleanup function
  const cleanupAnimations = useCallback((): void => {
    if (animationRef.current) {
      animationRef.current.cancel()
      animationRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    isAnimatingRef.current = false
    setIsAnimating(false)
    setIsVibrating(false)
  }, [])

  // 100% stable animation starter
  const startAnimation = useCallback(() => {
    if (isAnimatingRef.current || !elementRef.current) return

    cleanupAnimations()

    isAnimatingRef.current = true
    setIsAnimating(true)
    setIsHighlighted(true)
    setIsValid(false)
    setCurrentLetter("")

    let currentAttempt = 0

    const animateInvalidAttempt = (): void => {
      const {
        invalidAttempts,
        invalidLetters,
        vibrationDuration,
        typingSpeed,
        invalidDuration,
      } = optionsRef.current

      if (currentAttempt >= invalidAttempts) {
        animateValidLetter()
        return
      }

      const randomInvalidLetter =
        invalidLetters[Math.floor(Math.random() * invalidLetters.length)] ?? ""
      setCurrentLetter(randomInvalidLetter)

      setIsVibrating(true)

      if (elementRef.current) {
        const vibrationKeyframes = [
          { transform: "translateX(0)" },
          { transform: "translateX(-2px)" },
          { transform: "translateX(2px)" },
          { transform: "translateX(-2px)" },
          { transform: "translateX(2px)" },
          { transform: "translateX(0)" },
        ]

        animationRef.current = elementRef.current.animate(vibrationKeyframes, {
          duration: vibrationDuration,
          easing: "ease-in-out",
        })

        animationRef.current.onfinish = (): void => {
          setIsVibrating(false)

          timeoutRef.current = setTimeout(() => {
            setCurrentLetter("")

            timeoutRef.current = setTimeout(() => {
              currentAttempt++
              animateInvalidAttempt()
            }, typingSpeed)
          }, invalidDuration)
        }
      }
    }

    const animateValidLetter = (): void => {
      const { validLetter, onComplete } = optionsRef.current

      setCurrentLetter(validLetter)
      setIsValid(true)

      if (elementRef.current) {
        const popKeyframes = [
          { transform: "scale(0.9)" },
          { transform: "scale(1.1)" },
          { transform: "scale(1)" },
        ]

        animationRef.current = elementRef.current.animate(popKeyframes, {
          duration: 300,
          easing: "ease-out",
        })

        animationRef.current.onfinish = (): void => {
          isAnimatingRef.current = false
          setIsAnimating(false)

          if (onComplete) {
            onComplete()
          }
        }
      }
    }

    timeoutRef.current = setTimeout(() => {
      animateInvalidAttempt()
    }, optionsRef.current.typingSpeed)
  }, [cleanupAnimations])

  // Lifecycle effect depends only on solved state and perfectly stable callbacks
  useEffect(() => {
    if (solved) startAnimation()

    return cleanupAnimations
  }, [solved, startAnimation, cleanupAnimations])

  return {
    currentLetter,
    isAnimating,
    isValid,
    isVibrating,
    isHighlighted,
    startAnimation,
    setRef,
  }
}
