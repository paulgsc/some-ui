import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { CrosswordCell } from "@input/types/crossword"

type RevealOptions = {
  grid: Array<CrosswordCell>
  updateGrid: Dispatch<SetStateAction<Array<CrosswordCell>>>
  duration: number
  delay?: number
  onComplete?: () => void
}

export const useSolveAnimation = ({
  grid,
  updateGrid,
  duration,
  delay = 0,
  onComplete,
}: RevealOptions) => {
  const [isComplete, setIsComplete] = useState(false)
  const [phase, setPhase] = useState<"delay" | "animation">("animation")

  const startTimeRef = useRef<number | null>(null)
  const animationRef = useRef<number | null>(null)

  const shuffleArray = useCallback(<T>(array: Array<T>): Array<T> => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }, [])

  const revealCell = useCallback(() => {
    const nextCell = shuffleArray([...grid]).find((c) => !c.solved)
    if (nextCell === undefined) {
      setIsComplete(true)
      if (onComplete) onComplete()
      return
    }
    const { x, y } = nextCell
    updateGrid((prevCells) =>
      prevCells.map((cell) =>
        cell.x === x && cell.y === y ? { ...cell, solved: true } : cell
      )
    )
  }, [])

  const completeReveal = useCallback(() => {
    updateGrid((prevCells) =>
      prevCells.map((cell) => ({ ...cell, solved: true }))
    )
    setIsComplete(true)
    if (onComplete) onComplete()
  }, [])

  const clearAll = useCallback(() => {
    updateGrid((prevCells) =>
      prevCells.map((cell) => ({ ...cell, solved: false }))
    )
    setIsComplete(false)
  }, [])

  const animate = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    startTimeRef.current = performance.now()
    setPhase("animation")
    animationRef.current = requestAnimationFrame(updateAnimation)
  }, [])

  // Animation frame update function
  const updateAnimation = useCallback((timestamp: number): void => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp
    }

    const elapsed = timestamp - startTimeRef.current

    if (phase === "animation") {
      // During animation phase
      if (elapsed < duration) {
        // Animation still running
        revealCell()
        animationRef.current = requestAnimationFrame(updateAnimation)
      } else {
        // Animation complete, start delay
        startTimeRef.current = timestamp
        setPhase("delay")
        animationRef.current = requestAnimationFrame(updateAnimation)
      }
      return
    }
    // During delay phase
    if (elapsed < delay) {
      // Still in delay
      animationRef.current = requestAnimationFrame(updateAnimation)
      return
    }
    // Delay complete, start new cycle
    clearAll()
    animate()
  }, [])

  const stop = (): void => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }

  const reset = () => {
    stop()
    setPhase("animation")
  }

  // Start/stop based on isActive prop
  useEffect(() => {
    animate()

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return {
    isComplete,
    completeReveal,
  }
}
