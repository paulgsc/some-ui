export type Direction = "across" | "down"

export type Word = {
  x: number
  y: number
  direction: Direction
  length: number
  clueNumber?: number
  word?: string // The actual word content
}

export type VirtualGrid = {
  crosswords: Array<Word>
  size: number
}

type CrosswordOptions = {
  words: Array<Word>
  autoNumberClues?: boolean
}

export type CrosswordCell = {
  x: number
  y: number
  num?: number
  letter?: string
  across?: boolean
  down?: boolean
}

/**
 * Generates a crossword grid from a list of words.
 * @param options - The crossword options, including the list of words and auto-numbering setting.
 * @returns An array of CrosswordCell objects representing the grid.
 */
export function generateCrosswordGrid({
  words,
  autoNumberClues = true,
}: CrosswordOptions): Array<CrosswordCell> {
  const grid: Map<string, CrosswordCell> = new Map()
  let currentClueNumber = 1

  for (const word of words) {
    const { x, y, direction, length, word: wordContent } = word

    // If no actual word content is provided, skip this word
    if (!wordContent) continue

    for (let i = 0; i < length; i++) {
      const cx = direction === "across" ? x + i : x
      const cy = direction === "down" ? y + i : y
      const key = `${cx}-${cy}`
      const letter = wordContent[i]

      if (grid.has(key)) {
        // Update existing cell
        const cell = grid.get(key)!

        // Check if letters match at intersection
        if (cell.letter && cell.letter !== letter) {
          console.warn(
            `Letter mismatch at (${cx},${cy}): ${cell.letter} vs ${letter}`
          )
          continue // Skip the rest of the word placement.  Important.
        }

        // Update cell with direction.  Combine directions.
        cell.across = cell.across || direction === "across"
        cell.down = cell.down || direction === "down"

        // Set letter if not set yet
        if (!cell.letter) {
          cell.letter = letter
        }
      } else {
        // Create new cell
        grid.set(key, {
          x: cx,
          y: cy,
          letter,
          across: direction === "across",
          down: direction === "down",
        })
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
  wordList: Array<string>,
  _gridSize = 15
): VirtualGrid {
  const words: Array<Word> = []
  const occupied = new Map<string, string>() // position -> letter
  const maxWordLength = Math.max(...wordList.map((w) => w.length))
  const virtualGridSize = 2 * maxWordLength // Increased to handle longer words.
  const maxIntersections = 8 // Limit the number of intersections for a cleaner puzzle
  let intersectionCount = 0

  /**
   * Checks if a word can be placed at the specified coordinates in the given direction.
   * @param x The starting x-coordinate.
   * @param y The starting y-coordinate.
   * @param wordText The word to place.
   * @param dir The direction to place the word (across or down).
   * @returns boolean indicating if the word can be placed
   */
  function canPlaceWord(
    x: number,
    y: number,
    wordText: string,
    dir: Direction
  ): boolean {
    if (!wordText) return false

    let hasIntersection = false

    for (let i = 0; i < wordText.length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      const key = `${cx}-${cy}`

      // Check boundaries within the virtual grid
      if (cx >= virtualGridSize || cy >= virtualGridSize || cx < 0 || cy < 0) {
        return false
      }

      // Check if position is occupied with a different letter
      if (occupied.has(key)) {
        if (occupied.get(key) !== wordText[i]) {
          return false
        }
        hasIntersection = true
      }

      // Check adjacent cells - we don't want words side by side.  Important for word search aspect.
      if (!occupied.has(key)) {
        const adjacentKeys = []
        if (dir === "across") {
          adjacentKeys.push(`${cx}-${cy - 1}`, `${cx}-${cy + 1}`)
          if (i === 0) adjacentKeys.push(`${cx - 1}-${cy}`) //check the cell before the word
          if (i === wordText.length - 1) adjacentKeys.push(`${cx + 1}-${cy}`) //check the cell after the word
        } else {
          adjacentKeys.push(`${cx - 1}-${cy}`, `${cx + 1}-${cy}`)
          if (i === 0) adjacentKeys.push(`${cx}-${cy - 1}`)
          if (i === wordText.length - 1) adjacentKeys.push(`${cx}-${cy + 1}`)
        }

        for (const adjKey of adjacentKeys) {
          if (occupied.has(adjKey)) {
            return false
          }
        }
      }
    }
    // For the second word onwards, require an intersection, unless maxIntersections is reached
    if (
      words.length > 0 &&
      !hasIntersection &&
      intersectionCount < maxIntersections
    ) {
      return false
    }

    return true
  }

  function placeWord(
    x: number,
    y: number,
    wordText: string,
    dir: Direction
  ): void {
    for (let i = 0; i < wordText.length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      const key = `${cx}-${cy}`
      occupied.set(key, wordText[i])
    }
    words.push({
      x,
      y,
      length: wordText.length,
      direction: dir,
      word: wordText,
    })
  }

  // Filter wordList to use only words that fit in the virtual grid
  const validWordList = wordList.filter((word) => word.length < virtualGridSize)

  if (validWordList.length === 0) {
    console.error("No valid words found!")
    return {
      crosswords: [],
      size: 0,
    }
  }

  // Place the first word randomly
  const firstWord =
    validWordList[Math.floor(Math.random() * validWordList.length)]
  const firstDir: Direction = Math.random() > 0.5 ? "across" : "down"
  const startX = Math.floor(Math.random() * virtualGridSize)
  const startY = Math.floor(Math.random() * virtualGridSize)

  placeWord(startX, startY, firstWord, firstDir)
  intersectionCount = 0

  // Try to place the rest of the words
  const maxAttempts = 2000 // Increased attempts for more robust placement
  let overallAttempts = 0
  const placedWords = [firstWord] // Keep track of placed words
  const availableWords = [...validWordList].filter((w) => w !== firstWord)

  while (availableWords.length > 0 && overallAttempts < maxAttempts) {
    let wordToPlaceIndex: number
    let wordToPlace: string
    let intersectingWord: string | undefined
    let intersectionX: number | undefined
    let intersectionY: number | undefined
    let dir: Direction
    let placed = false

    if (intersectionCount < maxIntersections && words.length > 0) {
      // Find a word that intersects with an existing word
      let shuffledPlacedWords = [...placedWords]
      shuffleArray(shuffledPlacedWords) // Shuffle to randomize intersection choice
      for (let pwIndex = 0; pwIndex < shuffledPlacedWords.length; pwIndex++) {
        intersectingWord = shuffledPlacedWords[pwIndex]
        const intersectingWordIndex = validWordList.indexOf(intersectingWord) //use validWordList
        if (intersectingWordIndex === -1) continue
        const wordPlacedObj = words.find((w) => w.word === intersectingWord)
        if (!wordPlacedObj) continue

        for (
          let wordIndex = 0;
          wordIndex < availableWords.length;
          wordIndex++
        ) {
          const currentWord = availableWords[wordIndex]
          for (let i = 0; i < intersectingWord.length; i++) {
            const intersectingLetter = intersectingWord[i]
            const intersectX =
              wordPlacedObj.direction === "across"
                ? wordPlacedObj.x + i
                : wordPlacedObj.x
            const intersectY =
              wordPlacedObj.direction === "down"
                ? wordPlacedObj.y + i
                : wordPlacedObj.y

            const letterIndex = currentWord.indexOf(intersectingLetter)
            if (letterIndex !== -1) {
              wordToPlaceIndex = wordIndex
              wordToPlace = currentWord
              intersectionX = intersectX
              intersectionY = intersectY
              dir = wordPlacedObj.direction === "across" ? "down" : "across"
              // Calculate the starting position for the word to be placed
              const x =
                dir === "across" ? intersectionX - letterIndex : intersectionX
              const y =
                dir === "down" ? intersectionY - letterIndex : intersectionY

              if (canPlaceWord(x, y, wordToPlace, dir)) {
                placeWord(x, y, wordToPlace, dir)
                placed = true
                availableWords.splice(wordIndex, 1)
                placedWords.push(wordToPlace)
                intersectionCount++
                break
              }
            }
          }
          if (placed) break
        }
        if (placed) break
      }
    } else {
      // Place word without intersection
      wordToPlaceIndex = Math.floor(Math.random() * availableWords.length)
      wordToPlace = availableWords[wordToPlaceIndex]
      for (let attempt = 0; attempt < 50; attempt++) {
        dir = Math.random() > 0.5 ? "across" : "down"
        const x = Math.floor(Math.random() * virtualGridSize)
        const y = Math.floor(Math.random() * virtualGridSize)
        if (canPlaceWord(x, y, wordToPlace, dir)) {
          placeWord(x, y, wordToPlace, dir)
          placed = true
          availableWords.splice(wordToPlaceIndex, 1)
          placedWords.push(wordToPlace)
          break
        }
      }
    }

    if (!placed) {
      availableWords.splice(availableWords.indexOf(wordToPlace), 1)
    }
    overallAttempts++
  }

  if (overallAttempts >= maxAttempts && availableWords.length > 0) {
    console.warn(
      `Exceeded maximum attempts (${maxAttempts}). Some words could not be placed.`
    )
  }

  // Number the words for clues
  if (words.length > 0) {
    let clueNumber = 1

    // Sort words by position (top to bottom, left to right)
    words.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

    for (const word of words) {
      // Check if this position already has a number
      const existingWordWithNumber = words.find(
        (w) => w.clueNumber !== undefined && w.x === word.x && w.y === word.y
      )

      if (existingWordWithNumber) {
        word.clueNumber = existingWordWithNumber.clueNumber
      } else {
        word.clueNumber = clueNumber++
      }
    }
  }
  return { crosswords: words, size: virtualGridSize }
}

export function createCrossword(wordList: Array<string>, gridSize = 15) {
  const crosswordGrid = generateRandomWords(wordList, gridSize)
  const grid = generateCrosswordGrid({
    words: crosswordGrid.crosswords,
    autoNumberClues: true,
  })

  return {
    crosswordGrid,
    grid,
  }
}

function shuffleArray<T>(array: Array<T>): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}
