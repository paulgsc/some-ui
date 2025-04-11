import { useCallback, useEffect, useState } from "react"
import type { CrosswordCell, WordPlacement } from "@input/types/crossword"

export function useCreateCrosswordPuzzle(p: Array<WordPlacement>) {
  const [grid, setGrid] = useState<Array<CrosswordCell>>([])
  const [viewBox, setViewBox] = useState<string>("")

  const convertToGridCells = useCallback(() => {
    const grid = new Map<string, CrosswordCell>()

    for (const w of p) {
      const { start_x: x, start_y: y, is_across, word, clue_num } = w

      // Skip if no word content
      if (!word) continue

      for (let i = 0; i < word.length; i++) {
        const cx = is_across ? x + i : x
        const cy = !is_across ? y + i : y
        const key = `${cx}-${cy}`
        const letter = word[i]

        if (grid.has(key)) continue

        grid.set(key, {
          x: cx,
          y: cy,
          letter,
          solved: false,
          ...(i === 0 ? { num: clue_num } : {}),
        })
      }
    }

    return Array.from(grid.values())
  }, [p])

  const calculateViewBox = useCallback((gridCells: Array<CrosswordCell>) => {
    if (gridCells.length === 0) return "0 0 100 100" // Default for empty grid

    // Find min and max coordinates
    const minX = Math.min(...gridCells.map((cell) => cell.x))
    const maxX = Math.max(...gridCells.map((cell) => cell.x))
    const minY = Math.min(...gridCells.map((cell) => cell.y))
    const maxY = Math.max(...gridCells.map((cell) => cell.y))

    // Calculate dimensions with some padding
    const padding = 10
    const width = (maxX - minX + 1) * 30 + padding * 2
    const height = (maxY - minY + 1) * 30 + padding * 2

    // Return viewBox string
    return `${minX * 30 - padding} ${minY * 30 - padding} ${width} ${height}`
  }, [])

  useEffect(() => {
    if (p.length > 0) {
      const g = convertToGridCells()
      setGrid(g)
      setViewBox(calculateViewBox(g))
    }
  }, [p])

  return {
    grid,
    setGrid,
    viewBox,
  }
}
