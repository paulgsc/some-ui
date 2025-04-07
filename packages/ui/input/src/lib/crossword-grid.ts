type Direction = "across" | "down"

export type Word = {
  x: number
  y: number
  direction: Direction
  length: number
  clueNumber?: number
}

type CrosswordOptions = {
  words: Array<Word>
  autoNumberClues?: boolean
}

export type CrosswordCell = {
  x: number
  y: number
  num?: number
  direction: Direction
}

export function generateCrosswordGrid({
  words,
  autoNumberClues = true,
}: CrosswordOptions): Array<CrosswordCell> {
  const grid: Map<string, CrosswordCell> = new Map()
  let currentClueNumber = 1

  for (const word of words) {
    const { x, y, direction, length } = word
    for (let i = 0; i < length; i++) {
      const cx = direction === "across" ? x + i : x
      const cy = direction === "down" ? y + i : y
      const key = `${cx}-${cy}`

      if (!grid.has(key)) {
        grid.set(key, { x: cx, y: cy, direction })
      }
    }

    if (autoNumberClues) {
      const clueKey = `${x}-${y}`
      const clueCell = grid.get(clueKey)
      if (clueCell && !clueCell.num) {
        clueCell.num = currentClueNumber++
      }
    }
  }

  return Array.from(grid.values())
}

export function generateRandomWords(
  wordLengths: Array<number>,
  gridSize = 15
): Array<Word> {
  const words: Array<Word> = []
  const occupied = new Set<string>()

  function canPlaceWord(
    x: number,
    y: number,
    length: number,
    dir: Direction
  ): boolean {
    for (let i = 0; i < length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      const key = `${cx}-${cy}`
      if (cx >= gridSize || cy >= gridSize || occupied.has(key)) {
        return false
      }
    }
    return true
  }

  function placeWord(
    x: number,
    y: number,
    length: number,
    dir: Direction
  ): void {
    for (let i = 0; i < length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      occupied.add(`${cx}-${cy}`)
    }
    words.push({ x, y, length, direction: dir })
  }

  for (const length of wordLengths) {
    let placed = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const dir: Direction = Math.random() > 0.5 ? "across" : "down"
      const maxX = dir === "across" ? gridSize - length : gridSize - 1
      const maxY = dir === "down" ? gridSize - length : gridSize - 1
      const x = Math.floor(Math.random() * (maxX + 1))
      const y = Math.floor(Math.random() * (maxY + 1))

      if (canPlaceWord(x, y, length, dir)) {
        placeWord(x, y, length, dir)
        placed = true
        break
      }
    }

    if (!placed) {
      console.warn(`Could not place word of length ${length}`)
    }
  }

  return words
}
