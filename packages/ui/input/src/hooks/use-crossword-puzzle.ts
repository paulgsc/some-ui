import { useCallback, useEffect, useRef, useState } from "react"
import { CLUES, SOLUTIONS } from "@input/data/crossword"
import type { CrosswordCell } from "@input/lib/crossword-grid"

export const useCrosswordPuzzle = (grid: Array<CrosswordCell>) => {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [activeClue, setActiveClue] = useState<number | null>(null)
  const [activeDirection, setActiveDirection] = useState<
    "across" | "down" | null
  >(null)
  const [highlightedCells, setHighlightedCells] = useState<Array<string>>([])
  const [solvedClues, setSolvedClues] = useState<Array<number>>([])
  const [isAnimating, setIsAnimating] = useState(false)
  const [currentTypewriterIndex, setCurrentTypewriterIndex] = useState(0)

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null)
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Get cells for a specific clue number and direction
  const getCellsForClue = useCallback(
    (clueNum: number, direction: "across" | "down") => {
      const cells: Array<string> = []

      // Find the starting cell
      const startCell = grid.find((cell) => cell.num === clueNum)
      if (!startCell) return cells

      if (direction === "across") {
        const x = startCell.x
        const y = startCell.y

        // Add the starting cell
        cells.push(`${x}-${y}`)

        // Add cells to the right until we hit the edge or another clue number
        let nextX = x + 1
        while (
          grid.some(
            (cell) => cell.x === nextX && cell.y === y && cell.num === null
          )
        ) {
          cells.push(`${nextX}-${y}`)
          nextX++
        }
      } else {
        // down
        const x = startCell.x
        const y = startCell.y

        // Add the starting cell
        cells.push(`${x}-${y}`)

        // Add cells below until we hit the edge or another clue number
        let nextY = y + 1
        while (
          grid.some(
            (cell) => cell.x === x && cell.y === nextY && cell.num === null
          )
        ) {
          cells.push(`${x}-${nextY}`)
          nextY++
        }
      }

      return cells
    },
    []
  )

  // Handle input change
  const handleInputChange = (id: string, value: string) => {
    if (value.length <= 1) {
      setAnswers((prev) => ({ ...prev, [id]: value.toUpperCase() }))

      // Move to next cell if a letter was entered
      if (value.length === 1) {
        const [x, y] = id.split("-").map(Number)

        // Find the next cell in the same direction
        const currentCell = grid.find((cell) => cell.x === x && cell.y === y)
        if (currentCell) {
          if (currentCell.across) {
            const nextCell = `${x + 1}-${y}`
            cellRefs.current[nextCell]?.focus()
          } else if (currentCell.down) {
            const nextCell = `${x}-${y + 1}`
            cellRefs.current[nextCell]?.focus()
          }
        }
      }
    }
  }

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent, x: number, y: number) => {
    if (e.key === "ArrowRight") {
      cellRefs.current[`${x + 1}-${y}`]?.focus()
    } else if (e.key === "ArrowLeft") {
      cellRefs.current[`${x - 1}-${y}`]?.focus()
    } else if (e.key === "ArrowUp") {
      cellRefs.current[`${x}-${y - 1}`]?.focus()
    } else if (e.key === "ArrowDown") {
      cellRefs.current[`${x}-${y + 1}`]?.focus()
    } else if (e.key === "Backspace" && !answers[`${x}-${y}`]) {
      // Move to previous cell if current cell is empty
      if (e.key === "Backspace") {
        const currentCell = grid.find((cell) => cell.x === x && cell.y === y)
        if (currentCell) {
          if (currentCell.across) {
            cellRefs.current[`${x - 1}-${y}`]?.focus()
          } else if (currentCell.down) {
            cellRefs.current[`${x}-${y - 1}`]?.focus()
          }
        }
      }
    }
  }

  // Animation controller
  const runAnimationStep = useCallback(() => {
    if (!isAnimating) return

    // If we have an active clue and we're not done typing
    if (activeClue && activeDirection && currentTypewriterIndex > 0) {
      const solution = SOLUTIONS[activeClue].answer || ""
      const cells = getCellsForClue(activeClue, activeDirection)

      if (currentTypewriterIndex < solution.length) {
        // Continue typewriter effect
        typewriterTimerRef.current = setTimeout(() => {
          const cellIndex = currentTypewriterIndex
          if (cellIndex < cells.length) {
            const cellId = cells[cellIndex]
            setAnswers((prev) => ({ ...prev, [cellId]: solution[cellIndex] }))
            setCurrentTypewriterIndex((prev) => prev + 1)
          }
          runAnimationStep()
        }, 300) // Typewriter speed
      } else {
        // We've finished typing this clue
        setSolvedClues((prev) => {
          const newSolvedClues = [...prev, activeClue]

          // Move to next clue after a pause
          animationTimerRef.current = setTimeout(() => {
            setActiveClue(null)
            setActiveDirection(null)
            setHighlightedCells([])
            setCurrentTypewriterIndex(0)
            runAnimationStep()
          }, 1000) // Pause between clues

          return newSolvedClues
        })
      }
    } else if (!activeClue) {
      // If all clues are solved, restart the animation
      const allClueNumbers = Object.keys(SOLUTIONS).map(Number)
      if (solvedClues.length === allClueNumbers.length) {
        animationTimerRef.current = setTimeout(() => {
          setSolvedClues([])
          setAnswers({})
          runAnimationStep()
        }, 3000) // Longer pause before restarting
        return
      }

      // Pick a random unsolved clue
      const unsolvedClues = Object.keys(SOLUTIONS)
        .map(Number)
        .filter((num) => !solvedClues.includes(num))

      if (unsolvedClues.length === 0) return

      const randomIndex = Math.floor(Math.random() * unsolvedClues.length)
      const nextClue = unsolvedClues[randomIndex]
      const direction = SOLUTIONS[nextClue].direction

      // Highlight the clue
      setActiveClue(nextClue)
      setActiveDirection(direction)
      setHighlightedCells(getCellsForClue(nextClue, direction))

      // Start typewriter effect after a delay
      animationTimerRef.current = setTimeout(() => {
        setCurrentTypewriterIndex(1)
        const cells = getCellsForClue(nextClue, direction)
        if (cells.length > 0) {
          setAnswers((prev) => ({
            ...prev,
            [cells[0]]: SOLUTIONS[nextClue].answer[0],
          }))
        }
        runAnimationStep()
      }, 1500) // Delay before starting to type
    }
  }, [
    isAnimating,
    activeClue,
    activeDirection,
    currentTypewriterIndex,
    getCellsForClue,
    solvedClues,
  ])

  // Start or stop animation
  useEffect(() => {
    if (isAnimating) {
      runAnimationStep()
    } else {
      // Clear timers when animation is stopped
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current)
        animationTimerRef.current = null
      }
      if (typewriterTimerRef.current) {
        clearTimeout(typewriterTimerRef.current)
        typewriterTimerRef.current = null
      }
    }

    // Clean up timers on unmount or when animation is stopped
    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current)
      }
      if (typewriterTimerRef.current) {
        clearTimeout(typewriterTimerRef.current)
      }
    }
  }, [isAnimating, runAnimationStep])

  // Reset the puzzle
  const resetPuzzle = () => {
    setAnswers({})
    setActiveClue(null)
    setActiveDirection(null)
    setHighlightedCells([])
    setSolvedClues([])
    setCurrentTypewriterIndex(0)
    setIsAnimating(false)

    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current)
      animationTimerRef.current = null
    }
    if (typewriterTimerRef.current) {
      clearTimeout(typewriterTimerRef.current)
      typewriterTimerRef.current = null
    }
  }

  // Toggle animation
  const toggleAnimation = () => {
    setIsAnimating((prev) => !prev)
  }

  // Print the puzzle
  const printPuzzle = () => {
    window.print()
  }

  return {
    name,
    answers,
    activeClue,
    activeDirection,
    highlightedCells,
    solvedClues,
    isAnimating,
    cellRefs,
    handleInputChange,
    handleKeyDown,
    resetPuzzle,
    toggleAnimation,
    printPuzzle,
    grid,
    CLUES,
    getCellsForClue,
  }
}
