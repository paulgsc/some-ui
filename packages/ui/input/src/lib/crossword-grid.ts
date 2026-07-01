/**
 * TODO: Implement crossword difficulty rating system
 *
 * Potential factors to consider for difficulty calculation:
 *
 * 1. Intersection density:
 *    - Fewer intersections = higher difficulty
 *    - Calculate: (maxIntersections - intersectionCount) / maxIntersections
 *
 * 2. Word obscurity/familiarity:
 *    - Incorporate frequency dictionary or word familiarity ratings
 *    - Calculate average rarity score across all words
 *    - Resources: word frequency lists, corpus data, or API like WordFrequency.info
 *
 * 3. Grid pattern complexity:
 *    - Measure connectedness (are there isolated sections?)
 *    - Calculate ratio of black spaces to total grid size
 *    - Check for symmetry (symmetrical patterns are more predictable)
 *
 * 4. Word length distribution:
 *    - Analyze variance in word lengths (more variance = higher difficulty)
 *    - Calculate percentage of words longer than 7 letters
 *
 * 5. Clue difficulty (if implementing clues):
 *    - Could range from straightforward definitions to cryptic/punny
 *    - Assign difficulty score to each clue type
 *
 * Proposed formula:
 * difficulty = (wordRarityFactor × 0.3) +
 *              (intersectionFactor × 0.3) +
 *              (gridComplexityFactor × 0.2) +
 *              (wordLengthFactor × 0.2)
 *
 * Each factor should be normalized to a 0-10 scale
 * Final difficulty could be expressed as:
 * 1-3: Easy
 * 4-6: Medium
 * 7-8: Hard
 * 9-10: Expert
 *
 * Simple initial implementation could use:
 * - Inverse of intersection count
 * - Average word length
 * - Percentage of grid that's filled
 */

export type Direction = "across" | "down"

export type Word = {
  x: number
  y: number
  direction: Direction
  length: number
  clueNumber?: number
  word?: string
}

export type CrosswordCell = {
  x: number
  y: number
  num?: number
  letter?: string
  across?: boolean
  down?: boolean
}

export type CrosswordGrid = {
  words: Array<Word>
  size: number
}

/**
 * Creates a crossword puzzle from a list of words
 * @param wordList List of words to include in the puzzle
 * @param gridSize Maximum size of the grid
 */
export function createCrossword(wordList: Array<string>, gridSize = 15) {
  // Filter out empty words and ensure unique entries
  const validWords = [
    ...new Set(wordList.filter((word) => word && word.trim().length > 0)),
  ]

  if (validWords.length === 0) {
    return { words: [], grid: [], size: 0 }
  }

  // Generate the crossword layout
  const crosswordLayout = generateCrosswordLayout(validWords, gridSize)

  // Convert to grid cells
  const grid = convertToGridCells(crosswordLayout.words)

  return {
    crosswordGrid: crosswordLayout,
    grid,
  }
}

/**
 * Generates a layout of words for a crossword puzzle
 */
function generateCrosswordLayout(
  wordList: Array<string>,
  gridSize = 15
): CrosswordGrid {
  // Calculate an appropriate virtual grid size
  const maxWordLength = Math.max(...wordList.map((w) => w.length))
  const virtualGridSize = Math.min(2 * maxWordLength, gridSize * 2)

  // Filter words that would fit in our grid
  const validWordList = wordList.filter((word) => word.length < virtualGridSize)

  if (validWordList.length === 0) {
    return { words: [], size: 0 }
  }

  const placedWords: Array<Word> = []
  const occupiedCells = new Map<string, string>() // key: "x-y", value: letter
  const maxIntersections = 8
  let intersectionCount = 0

  // Place the first word in the center
  const firstWord =
    validWordList[Math.floor(Math.random() * validWordList.length)] ?? ""
  const firstDir: Direction = Math.random() > 0.5 ? "across" : "down"

  // Center the first word
  const centerOffset = Math.floor(virtualGridSize / 2 - firstWord.length / 2)
  const startX =
    firstDir === "across" ? centerOffset : Math.floor(virtualGridSize / 2)
  const startY =
    firstDir === "down" ? centerOffset : Math.floor(virtualGridSize / 2)

  placeWord(firstWord, firstDir, startX, startY)

  // Track words we've placed and words still available to place
  const placedWordTexts = [firstWord]
  const availableWords = validWordList.filter((w) => w !== firstWord)

  // Try to place the remaining words
  const maxAttempts = 1000
  let attempts = 0

  while (availableWords.length > 0 && attempts < maxAttempts) {
    attempts++

    // Try to place with intersection if we haven't hit our limit
    if (
      intersectionCount < maxIntersections &&
      tryPlaceWordWithIntersection()
    ) {
      continue
    }

    // Otherwise try to place without intersection
    tryPlaceWordWithoutIntersection()
  }

  // Number the clues
  numberClues()

  return { words: placedWords, size: virtualGridSize }

  /**
   * Places a word on the grid and updates the occupied cells
   */
  function placeWord(
    wordText: string,
    dir: Direction,
    x: number,
    y: number
  ): void {
    for (let i = 0; i < wordText.length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      occupiedCells.set(`${cx}-${cy}`, wordText[i] ?? "")
    }

    placedWords.push({
      x,
      y,
      direction: dir,
      length: wordText.length,
      word: wordText,
    })
  }

  /**
   * Checks if a word can be placed at the specified position
   */
  function canPlaceWord(
    wordText: string,
    dir: Direction,
    x: number,
    y: number,
    requireIntersection: boolean = true
  ): boolean {
    let hasIntersection = false

    for (let i = 0; i < wordText.length; i++) {
      const cx = dir === "across" ? x + i : x
      const cy = dir === "down" ? y + i : y
      const key = `${cx}-${cy}`

      // Check boundaries
      if (cx < 0 || cy < 0 || cx >= virtualGridSize || cy >= virtualGridSize) {
        return false
      }

      // Check if cell is occupied
      if (occupiedCells.has(key)) {
        // Letters must match at intersection
        if (occupiedCells.get(key) !== wordText[i]) {
          return false
        }
        hasIntersection = true
      } else {
        // Check adjacent cells - no side-by-side words
        if (hasAdjacentWord(cx, cy, dir, i === 0, i === wordText.length - 1)) {
          return false
        }
      }
    }

    // If we need intersections, make sure we have one
    if (
      requireIntersection &&
      placedWords.length > 0 &&
      !hasIntersection &&
      intersectionCount < maxIntersections
    ) {
      return false
    }

    return true
  }

  /**
   * Checks if a cell has adjacent words that would make placement invalid
   */
  function hasAdjacentWord(
    x: number,
    y: number,
    dir: Direction,
    isStart: boolean,
    isEnd: boolean
  ): boolean {
    const adjacentKeys = []

    if (dir === "across") {
      // Check cells above and below
      adjacentKeys.push(`${x}-${y - 1}`, `${x}-${y + 1}`)

      // Check before/after if at word boundaries
      if (isStart) adjacentKeys.push(`${x - 1}-${y}`)
      if (isEnd) adjacentKeys.push(`${x + 1}-${y}`)
    } else {
      // Check cells left and right
      adjacentKeys.push(`${x - 1}-${y}`, `${x + 1}-${y}`)

      // Check before/after if at word boundaries
      if (isStart) adjacentKeys.push(`${x}-${y - 1}`)
      if (isEnd) adjacentKeys.push(`${x}-${y + 1}`)
    }

    return adjacentKeys.some((key) => occupiedCells.has(key))
  }

  /**
   * Attempts to place a word that intersects with an existing word
   */
  function tryPlaceWordWithIntersection(): boolean {
    // Shuffle the placed words to randomize intersections
    const shuffledPlacedWords = [...placedWordTexts]
    shuffleArray(shuffledPlacedWords)

    for (const existingWord of shuffledPlacedWords) {
      const wordObj = placedWords.find((w) => w.word === existingWord)
      if (!wordObj) continue

      // Direction for new word is opposite of existing word
      const newDir: Direction =
        wordObj.direction === "across" ? "down" : "across"

      // Shuffle available words for more randomness
      const shuffledAvailableWords = [...availableWords]
      shuffleArray(shuffledAvailableWords)

      for (const newWord of shuffledAvailableWords) {
        // Try to find an intersection point
        for (
          let existingLetterPos = 0;
          existingLetterPos < existingWord.length;
          existingLetterPos++
        ) {
          const existingLetter = existingWord[existingLetterPos]

          // Find all positions of this letter in the new word
          for (
            let newLetterPos = 0;
            newLetterPos < newWord.length;
            newLetterPos++
          ) {
            if (newWord[newLetterPos] !== existingLetter) continue

            // Calculate where the new word would start
            const intersectX =
              wordObj.direction === "across"
                ? wordObj.x + existingLetterPos
                : wordObj.x
            const intersectY =
              wordObj.direction === "down"
                ? wordObj.y + existingLetterPos
                : wordObj.y

            const newX =
              newDir === "across" ? intersectX - newLetterPos : intersectX
            const newY =
              newDir === "down" ? intersectY - newLetterPos : intersectY

            // Try to place the word
            if (canPlaceWord(newWord, newDir, newX, newY, true)) {
              placeWord(newWord, newDir, newX, newY)
              intersectionCount++

              // Update tracking lists
              availableWords.splice(availableWords.indexOf(newWord), 1)
              placedWordTexts.push(newWord)

              return true
            }
          }
        }
      }
    }

    return false
  }

  /**
   * Attempts to place a word without intersecting existing words
   */
  function tryPlaceWordWithoutIntersection(): boolean {
    if (availableWords.length === 0) return false

    // Pick a random word to place
    const randomIndex = Math.floor(Math.random() * availableWords.length)
    const wordToPlace = availableWords[randomIndex] ?? ""

    // Try multiple random positions
    for (let attempt = 0; attempt < 50; attempt++) {
      // Increased attempts for better placement chance
      const dir: Direction = Math.random() > 0.5 ? "across" : "down"
      const x = Math.floor(
        Math.random() *
          (virtualGridSize - (dir === "across" ? wordToPlace.length : 0))
      )
      const y = Math.floor(
        Math.random() *
          (virtualGridSize - (dir === "down" ? wordToPlace.length : 0))
      )

      // Pass false for requireIntersection to allow placement without intersection
      if (canPlaceWord(wordToPlace, dir, x, y, false)) {
        placeWord(wordToPlace, dir, x, y)

        // Update tracking lists
        availableWords.splice(randomIndex, 1)
        placedWordTexts.push(wordToPlace)

        return true
      }
    }

    // If we couldn't place it after multiple attempts, remove it
    availableWords.splice(randomIndex, 1)
    return false
  }

  /**
   * Numbers the clues in the crossword (top to bottom, left to right)
   */
  function numberClues(): void {
    if (placedWords.length === 0) return

    // Sort words by position
    placedWords.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

    // Use a map to track positions that need numbers
    const numbered = new Map<string, number>()
    let clueNumber = 1

    // First pass: assign numbers to starting positions
    for (const word of placedWords) {
      const key = `${word.x}-${word.y}`

      // Check if this position already has a number
      if (!numbered.has(key)) {
        numbered.set(key, clueNumber++)
      }
    }

    // Second pass: assign clue numbers to words
    for (const word of placedWords) {
      const key = `${word.x}-${word.y}`
      word.clueNumber = numbered.get(key)
    }
  }
}

/**
 * Converts the word layout to a grid of cells
 */
function convertToGridCells(words: Array<Word>): Array<CrosswordCell> {
  const grid = new Map<string, CrosswordCell>()

  for (const word of words) {
    const { x, y, direction, length, clueNumber, word: wordContent } = word

    // Skip if no word content
    if (!wordContent) continue

    for (let i = 0; i < length; i++) {
      const cx = direction === "across" ? x + i : x
      const cy = direction === "down" ? y + i : y
      const key = `${cx}-${cy}`
      const letter = wordContent[i]

      if (grid.has(key)) {
        // Update existing cell
        const cell = grid.get(key)!

        // Combine directions
        cell.across ||= direction === "across"
        cell.down ||= direction === "down"

        // Letter should match at intersections
        if (cell.letter && cell.letter !== letter) {
          // eslint-disable-next-line no-console
          console.warn(
            `Letter mismatch at (${cx},${cy}): ${cell.letter} vs ${letter}`
          )
        }
      } else {
        // Create new cell
        grid.set(key, {
          x: cx,
          y: cy,
          letter,
          across: direction === "across",
          down: direction === "down",
          ...(i === 0 && clueNumber ? { num: clueNumber } : {}),
        })
      }
    }
  }

  return Array.from(grid.values())
}

/**
 * Shuffles array elements in place
 */
export function shuffleArray<T>(input: ReadonlyArray<T>): Array<T> {
  const array = [...input]

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))

    const temp = array[i]
    array[i] = array[j] as T
    array[j] = temp as T
  }

  return array
}
