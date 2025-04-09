import { useEffect, useRef, useState } from "react"

type TypewriterAnimationOptions = {
  validLetter: string
  invalidLetters?: Array<string>
  invalidAttempts?: number
  typingSpeed?: number
  invalidDuration?: number
  vibrationDuration?: number
  onComplete?: () => void
}

export function useTypewriterAnimation({
  validLetter,
  invalidLetters = ["x", "y", "z", "a", "b", "c"],
  invalidAttempts = 3,
  typingSpeed = 150,
  invalidDuration = 300,
  vibrationDuration = 300,
  onComplete,
}: TypewriterAnimationOptions) {
  const [currentLetter, setCurrentLetter] = useState<string>("")
  const [isAnimating, setIsAnimating] = useState(false)
  const [isValid, setIsValid] = useState(false)
  const [isVibrating, setIsVibrating] = useState(false)
  const [isHighlighted, setIsHighlighted] = useState(false)

  const animationRef = useRef<Animation | null>(null)
  const elementRef = useRef<SVGSVGElement | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Function to set the element reference
  const setRef = (element: SVGSVGElement | null) => {
    elementRef.current = element
  }

  // Clean up any running animations or timeouts
  const cleanupAnimations = () => {
    if (animationRef.current) {
      animationRef.current.cancel()
      animationRef.current = null
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Start the typewriter animation sequence
  const startAnimation = () => {
    if (isAnimating || !elementRef.current) return

    cleanupAnimations()
    setIsAnimating(true)
    setIsHighlighted(true)
    setIsValid(false)
    setCurrentLetter("")

    // Start the animation sequence
    runAnimationSequence()
  }

  // Run the full animation sequence
  const runAnimationSequence = () => {
    if (!elementRef.current) return

    let currentAttempt = 0
    let currentTime = 0

    // Initial delay before starting
    currentTime += typingSpeed
    timeoutRef.current = setTimeout(() => {
      animateInvalidAttempt()
    }, currentTime)

    // Function to animate a single invalid attempt
    function animateInvalidAttempt() {
      if (currentAttempt >= invalidAttempts) {
        // We've completed all invalid attempts, show the valid letter
        animateValidLetter()
        return
      }

      // Choose a random invalid letter
      const randomInvalidLetter =
        invalidLetters[Math.floor(Math.random() * invalidLetters.length)]
      setCurrentLetter(randomInvalidLetter)

      // Start vibration animation
      setIsVibrating(true)

      if (elementRef.current) {
        // Create vibration animation using Web Animations API
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

        // When vibration animation ends
        animationRef.current.onfinish = () => {
          setIsVibrating(false)

          // Keep the invalid letter visible for a moment
          timeoutRef.current = setTimeout(() => {
            // Clear the letter
            setCurrentLetter("")

            // Wait before the next attempt
            timeoutRef.current = setTimeout(() => {
              currentAttempt++
              animateInvalidAttempt()
            }, typingSpeed)
          }, invalidDuration)
        }
      }
    }

    // Function to animate the valid letter
    function animateValidLetter() {
      setCurrentLetter(validLetter)
      setIsValid(true)

      if (elementRef.current) {
        // Create a subtle "pop" animation for the valid letter
        const popKeyframes = [
          { transform: "scale(0.9)" },
          { transform: "scale(1.1)" },
          { transform: "scale(1)" },
        ]

        animationRef.current = elementRef.current.animate(popKeyframes, {
          duration: 300,
          easing: "ease-out",
        })

        animationRef.current.onfinish = () => {
          setIsAnimating(false)

          // Call onComplete callback if provided
          if (onComplete) {
            onComplete()
          }
        }
      }
    }
  }

  // Clean up animations when component unmounts
  useEffect(() => {
    return () => {
      cleanupAnimations()
    }
  }, [])

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
