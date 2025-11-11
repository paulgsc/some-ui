import { useCallback, useEffect, useState } from "react"

type UseSlideshowProps = {
  totalSlides: number
  autoAdvanceInterval?: number
  pauseDuration?: number
}

export function useSlideshow({
  totalSlides,
  autoAdvanceInterval = 5000,
  pauseDuration = 10000,
}: UseSlideshowProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [progressKey, setProgressKey] = useState(0)

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides)
    setProgressKey((prev) => prev + 1)
  }, [totalSlides])

  const goToSlide = useCallback(
    (index: number) => {
      setAutoAdvance(false)
      setCurrentSlide(index)
      setProgressKey((prev) => prev + 1)

      // Resume auto-advance after pause duration
      setTimeout(() => {
        setAutoAdvance(true)
      }, pauseDuration)
    },
    [pauseDuration]
  )

  // Auto-advance effect
  useEffect(() => {
    if (!autoAdvance) return

    const interval = setInterval(() => {
      nextSlide()
    }, autoAdvanceInterval)

    return () => clearInterval(interval)
  }, [autoAdvance, autoAdvanceInterval, nextSlide])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        goToSlide((currentSlide + 1) % totalSlides)
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        goToSlide((currentSlide - 1 + totalSlides) % totalSlides)
      } else if (e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        goToSlide(Number.parseInt(e.key) - 1)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [currentSlide, totalSlides, goToSlide])

  return {
    currentSlide,
    goToSlide,
    nextSlide,
    progressKey,
  }
}
