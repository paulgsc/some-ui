import { useCallback, useEffect, useReducer, useRef } from "react"
import type { CrosswordCell, WordPlacement } from "@input/types/crossword"

type ViewBoxTuple = [minX: number, minY: number, width: number, height: number]
type CrosswordState = {
  grid: Array<CrosswordCell>
  viewBox: ViewBoxTuple
  isAnimating: boolean
  completionPercentage: number
}

// Actions for our reducer
type CrosswordAction =
  | {
      type: "INITIALIZE_GRID"
      grid: Array<CrosswordCell>
      viewBox: ViewBoxTuple
    }
  | { type: "REVEAL_CELL"; x: number; y: number }
  | { type: "RESET_CELLS" }
  | { type: "REVEAL_ALL" }
  | { type: "SET_ANIMATION"; isAnimating: boolean }
  | { type: "UPDATE_COMPLETION"; percentage: number }

// Reducer to handle all state changes
function crosswordReducer(
  state: CrosswordState,
  action: CrosswordAction
): CrosswordState {
  switch (action.type) {
    case "INITIALIZE_GRID":
      return {
        ...state,
        grid: action.grid,
        viewBox: action.viewBox,
      }
    case "REVEAL_CELL":
      return {
        ...state,
        grid: state.grid.map((cell) =>
          cell.x === action.x && cell.y === action.y
            ? { ...cell, solved: true }
            : cell
        ),
      }
    case "RESET_CELLS":
      return {
        ...state,
        grid: state.grid.map((cell) => ({ ...cell, solved: false })),
        completionPercentage: 0,
      }
    case "REVEAL_ALL":
      return {
        ...state,
        grid: state.grid.map((cell) => ({ ...cell, solved: true })),
        completionPercentage: 100,
      }
    case "SET_ANIMATION":
      return {
        ...state,
        isAnimating: action.isAnimating,
      }
    case "UPDATE_COMPLETION":
      return {
        ...state,
        completionPercentage: action.percentage,
      }
    default:
      action satisfies never
      return state
  }
}

type ReturnOptions = {
  startAnimation: () => (() => void) | undefined
  stopAnimation: () => void
  resetCrossword: () => void
  revealAllCells: () => void
} & CrosswordState

export function useCrosswordWithAnimation(
  wordPlacements: Array<WordPlacement>,
  animationDuration = 3000
): ReturnOptions {
  // Initialize state with our reducer
  const [state, dispatch] = useReducer(crosswordReducer, {
    grid: [],
    viewBox: [0, 0, 100, 100],
    isAnimating: false,
    completionPercentage: 0,
  })

  // Animation refs
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const unsolvedCellsRef = useRef<Array<CrosswordCell>>([])
  const lastRevealedIndexRef = useRef<number>(0)

  // Compute the grid once when word placements change
  useEffect(() => {
    if (wordPlacements.length === 0) return

    // Create grid cells from word placements
    const gridMap = new Map<string, CrosswordCell>()

    for (const placement of wordPlacements) {
      const { start_x, start_y, is_across, word, clue_num } = placement
      if (!word) continue

      for (let i = 0; i < word.length; i++) {
        const x = is_across ? start_x + i : start_x
        const y = !is_across ? start_y + i : start_y
        const key = `${x}-${y}`

        if (!gridMap.has(key)) {
          gridMap.set(key, {
            x,
            y,
            letter: word[i],
            solved: false,
            clueNum: [clue_num],
            showClueNum: i === 0 ? true : false,
          })
        } else {
          const existing = gridMap.get(key)
          if (existing)
            gridMap.set(key, {
              ...existing,
              clueNum: [...new Set([...existing.clueNum, clue_num])],
              showClueNum: i === 0 ? true : existing.showClueNum,
            })
        }
      }
    }

    const gridArray = Array.from(gridMap.values())

    // Calculate viewBox
    let viewBox: ViewBoxTuple = [0, 0, 100, 100]
    if (gridArray.length > 0) {
      const minX = Math.min(...gridArray.map((cell) => cell.x))
      const maxX = Math.max(...gridArray.map((cell) => cell.x))
      const minY = Math.min(...gridArray.map((cell) => cell.y))
      const maxY = Math.max(...gridArray.map((cell) => cell.y))

      const padding = 10
      const cellSize = 30
      const width = (maxX - minX + 1) * cellSize + padding * 2
      const height = (maxY - minY + 1) * cellSize + padding * 2

      viewBox = [
        minX * cellSize - padding,
        minY * cellSize - padding,
        width,
        height,
      ]
    }

    dispatch({ type: "INITIALIZE_GRID", grid: gridArray, viewBox })
  }, [wordPlacements])

  // Handle animation
  const startAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Reset state for a new animation
    lastRevealedIndexRef.current = 0

    // Get unsolved cells
    unsolvedCellsRef.current = state.grid.filter((cell) => !cell.solved)

    // No unsolved cells, nothing to animate
    if (unsolvedCellsRef.current.length === 0) {
      dispatch({ type: "SET_ANIMATION", isAnimating: false })
      return
    }

    // Shuffle the unsolved cells for random reveals
    for (let i = unsolvedCellsRef.current.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = unsolvedCellsRef.current[i]
      unsolvedCellsRef.current[i] = unsolvedCellsRef.current[j]
      unsolvedCellsRef.current[j] = temp
    }

    startTimeRef.current = performance.now()
    dispatch({ type: "SET_ANIMATION", isAnimating: true })

    // Start animation frame
    const animate = (timestamp: number): void => {
      if (!startTimeRef.current) startTimeRef.current = timestamp

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / animationDuration, 1)

      // Calculate how many cells should be revealed by now
      const totalCells = unsolvedCellsRef.current.length
      const cellsToReveal = Math.floor(progress * totalCells)

      // Only reveal cells that haven't been revealed yet
      while (lastRevealedIndexRef.current < cellsToReveal) {
        const cellToReveal =
          unsolvedCellsRef.current[lastRevealedIndexRef.current]
        if (cellToReveal) {
          dispatch({
            type: "REVEAL_CELL",
            x: cellToReveal.x,
            y: cellToReveal.y,
          })
        }
        lastRevealedIndexRef.current++
      }

      dispatch({ type: "UPDATE_COMPLETION", percentage: progress * 100 })

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        // Ensure all cells are revealed at the end
        unsolvedCellsRef.current.forEach((cell) => {
          dispatch({ type: "REVEAL_CELL", x: cell.x, y: cell.y })
        })
        dispatch({ type: "SET_ANIMATION", isAnimating: false })
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [state.grid, animationDuration])

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    dispatch({ type: "SET_ANIMATION", isAnimating: false })
  }, [])

  const resetCrossword = useCallback(() => {
    stopAnimation()
    dispatch({ type: "RESET_CELLS" })
  }, [stopAnimation])

  const revealAllCells = useCallback(() => {
    stopAnimation()
    dispatch({ type: "REVEAL_ALL" })
  }, [stopAnimation])

  // Clean up animation on unmount
  useEffect(() => {
    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    grid: state.grid,
    viewBox: state.viewBox,
    isAnimating: state.isAnimating,
    completionPercentage: state.completionPercentage,
    startAnimation,
    stopAnimation,
    resetCrossword,
    revealAllCells,
  }
}
