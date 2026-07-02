import { useCallback, useEffect, useReducer, useRef } from "react"
import { cluesJson } from "@input/data/clues"
import type {
  CrosswordCell,
  CrosswordClue,
  CrosswordClueWithNum,
  Direction,
  WordPlacement,
} from "@input/types/crossword"
import { cubeEvents } from "@some-ui/slideshow"
import { createEventBus } from "some-ui-utils"

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
      const { startX, startY, isAcross, clueNum, word } = placement
      if (!word) continue

      for (let i = 0; i < word.length; i++) {
        const direction = isAcross ? "across" : "down"
        const x = isAcross ? startX + i : startX
        const y = !isAcross ? startY + i : startY
        const key = `${x}-${y}`

        if (!gridMap.has(key)) {
          gridMap.set(key, {
            x,
            y,
            direction,
            word,
            letter: word[i],
            solved: false,
            clueNum: i === 0 ? clueNum : undefined,
            clueNums: [clueNum],
          })
        } else {
          const existing = gridMap.get(key)
          if (existing)
            gridMap.set(key, {
              ...existing,
              clueNum: i === 0 ? clueNum : existing.clueNum,
              clueNums: [...new Set([...existing.clueNums, clueNum])],
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

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    dispatch({ type: "SET_ANIMATION", isAnimating: false })
  }, [])

  const setUnsolved = useCallback(() => {
    lastRevealedIndexRef.current = 0
    unsolvedCellsRef.current = state.grid.filter((cell) => !cell.solved)
    for (let i = unsolvedCellsRef.current.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const a = unsolvedCellsRef.current[i]
      const b = unsolvedCellsRef.current[j]
      if (a !== undefined && b !== undefined) {
        unsolvedCellsRef.current[i] = b
        unsolvedCellsRef.current[j] = a
      }
    }
    clueEvents.setState((prev: CrosswordClueState) => {
      const cluesAcross: Array<CrosswordClueWithNum> = []
      const cluesDown: Array<CrosswordClueWithNum> = []
      for (const el of unsolvedCellsRef.current) {
        const c: CrosswordClue | undefined = cluesJson.find(
          (c) => c.word.toLowerCase() === el.word.toLowerCase()
        )
        if (!c) {
          stopAnimation()
          return {
            cluesAcross: [],
            cluesDown: [],
            lastRevealedAcrossIndex: -1,
            lastRevealedDownIndex: -1,
          }
        }
        if (el.direction === "across") {
          cluesAcross.push({
            ...c,
            clueNum: el.clueNum ?? el.clueNums.at(0) ?? 0,
          })
        } else {
          cluesDown.push({
            ...c,
            clueNum: el.clueNum ?? el.clueNums.at(0) ?? 0,
          })
        }
      }
      return {
        ...prev,
        cluesAcross,
        cluesDown,
        direction: unsolvedCellsRef.current.at(0)?.direction,
      }
    })
    cubeEvents.setState(() => ({
      id: unsolvedCellsRef.current.at(0)?.direction,
    }))
  }, [state.grid, stopAnimation])

  const notifyRevealCell = useCallback((direction: Direction) => {
    switch (direction) {
      case "across": {
        notificationEvents.emit("reveal:cell:across", undefined)
        break
      }
      case "down": {
        notificationEvents.emit("reveal:cell:down", undefined)
        break
      }
      default:
        direction satisfies never
    }
  }, [])

  // Handle animation
  const startAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (unsolvedCellsRef.current.length === 0) setUnsolved()

    startTimeRef.current = performance.now()
    dispatch({ type: "SET_ANIMATION", isAnimating: true })
    notificationEvents.emit("notification:start", undefined)

    // Start animation frame
    const animate = (timestamp: number): void => {
      if (!startTimeRef.current) startTimeRef.current = timestamp

      const elapsed = timestamp - startTimeRef.current

      if (elapsed >= animationDuration) {
        startTimeRef.current = timestamp

        const cellToReveal =
          unsolvedCellsRef.current[lastRevealedIndexRef.current]
        if (cellToReveal) {
          dispatch({
            type: "REVEAL_CELL",
            x: cellToReveal.x,
            y: cellToReveal.y,
          })

          clueEvents.setState((prev): CrosswordClueState => {
            const isAcross = cellToReveal.direction === "across"

            return {
              ...prev,
              direction: cellToReveal.direction,
              lastRevealedAcrossIndex: isAcross
                ? prev.lastRevealedAcrossIndex + 1
                : prev.lastRevealedAcrossIndex,
              lastRevealedDownIndex: isAcross
                ? prev.lastRevealedDownIndex
                : prev.lastRevealedDownIndex + 1,
            }
          })

          notifyRevealCell(cellToReveal.direction)

          cubeEvents.setState(() => ({
            id: cellToReveal.direction,
          }))
        }
        lastRevealedIndexRef.current++
      }

      if (lastRevealedIndexRef.current >= unsolvedCellsRef.current.length) {
        stopAnimation()
        return
      }
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [setUnsolved, notifyRevealCell, stopAnimation, animationDuration])

  const resetCrossword = useCallback(() => {
    stopAnimation()
    dispatch({ type: "RESET_CELLS" })
    notificationEvents.emit("reset:cells", undefined)
  }, [stopAnimation])

  const revealAllCells = useCallback(() => {
    stopAnimation()
    dispatch({ type: "REVEAL_ALL" })
  }, [stopAnimation])

  // Clean up animation on unmount
  useEffect(() => {
    startAnimation()
    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [startAnimation])

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

type NotificationEventPayloads = {
  "reveal:cell:across": undefined
  "reveal:cell:down": undefined
  "reset:cells": undefined
  "animation:pause": undefined
  "notification:start": undefined
  "notification:stop": undefined
  "notification:complete": undefined // Auto-added when using state
}

export const notificationEvents = createEventBus<NotificationEventPayloads>()

export type CrosswordClueState = {
  cluesAcross: Array<CrosswordClueWithNum>
  cluesDown: Array<CrosswordClueWithNum>
  direction?: Direction
  lastRevealedAcrossIndex: number
  lastRevealedDownIndex: number
}

type CrosswordClueEventPayloads = {
  "clues:update:queue": { clues: Array<CrosswordClueWithNum> }
  "state:changed": {
    prevState: CrosswordClueState
    nextState: CrosswordClueState
  }
}

export const clueEvents = createEventBus<
  CrosswordClueEventPayloads,
  CrosswordClueState
>({
  cluesAcross: [],
  cluesDown: [],
  lastRevealedAcrossIndex: 0,
  lastRevealedDownIndex: 0,
})
