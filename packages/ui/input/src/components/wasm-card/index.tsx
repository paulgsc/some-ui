import { useEffect, useRef, useState } from "react"
import init, { CrosswordGenerator } from "some-crossword"

type CrosswordResult = {
  grid: Array<string>
  width: number
  height: number
  word_placements: Array<WordPlacement>
}

type WordPlacement = {
  word: string
  start_x: number
  start_y: number
  is_across: boolean
  group_id: number | null
}

type CellState = {
  value: string
  isRevealed: boolean
  isSelected: boolean
  isHighlighted: boolean
  number?: number
}

export const CrosswordComponent = () => {
  const [crossword, setCrossword] = useState<CrosswordResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wordInput, setWordInput] = useState("")
  const [wordList, setWordList] = useState<Array<string>>([
    "react",
    "rust",
    "wasm",
    "web",
    "code",
    "grid",
    "puzzle",
    "javascript",
    "typescript",
    "async",
  ])
  const [cellStates, setCellStates] = useState<Array<Array<CellState>>>([])
  const [maxGroupSize, setMaxGroupSize] = useState(5)
  const [currentCell, setCurrentCell] = useState<{
    x: number
    y: number
  } | null>(null)
  const [isAcrossMode, setIsAcrossMode] = useState(true)
  const [isComplete, setIsComplete] = useState(false)

  const gridRef = useRef<HTMLDivElement>(null)

  // Generate a new crossword
  const generateCrossword = async () => {
    if (wordList.length === 0) {
      setError("Please add at least one word")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Initialize the WASM module
      await init()

      // Create a new generator with words and max group size
      const generator = new CrosswordGenerator(wordList, maxGroupSize)

      // Generate the crossword
      const result = await generator.generate()

      // Set the result to state
      setCrossword(result as CrosswordResult)

      // Initialize cell states
      initializeCellStates(result as CrosswordResult)

      setIsLoading(false)
    } catch (err) {
      console.error("Error generating crossword:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
      setIsLoading(false)
    }
  }

  // Initialize cell states based on the generated crossword
  const initializeCellStates = (result: CrosswordResult) => {
    const { grid, width, height } = result

    // Create empty grid of cell states
    const states: Array<Array<CellState>> = Array(height)
      .fill(null)
      .map(() =>
        Array(width)
          .fill(null)
          .map(() => ({
            value: "",
            isRevealed: false,
            isSelected: false,
            isHighlighted: false,
          }))
      )

    // Fill in correct values and add cell numbers
    let cellNumber = 1

    // Sort placements by position (top-to-bottom, left-to-right)
    const sortedPlacements = [...result.word_placements].sort((a, b) => {
      if (a.start_y !== b.start_y) return a.start_y - b.start_y
      return a.start_x - b.start_x
    })

    // Assign cell numbers
    for (const placement of sortedPlacements) {
      const { start_x, start_y, is_across, word } = placement

      // Check if we need a new number for this word
      let needsNumber = true

      // If a word already starts at this position, don't add a new number
      for (const otherPlacement of sortedPlacements) {
        if (otherPlacement === placement) continue

        if (
          otherPlacement.start_x === start_x &&
          otherPlacement.start_y === start_y
        ) {
          needsNumber = false
          break
        }
      }

      if (needsNumber) {
        states[start_y][start_x].number = cellNumber++
      }

      // Set correct value for each cell in the word
      for (let i = 0; i < word.length; i++) {
        const x = is_across ? start_x + i : start_x
        const y = is_across ? start_y : start_y + i

        states[y][x].value = grid[y][x]
      }
    }

    setCellStates(states)
  }

  // Update cell selection and highlighting
  const updateSelection = (x: number, y: number) => {
    if (!crossword) return

    const newStates = [...cellStates]

    // Clear previous selection and highlighting
    for (let i = 0; i < newStates.length; i++) {
      for (let j = 0; j < newStates[i].length; j++) {
        newStates[i][j].isSelected = false
        newStates[i][j].isHighlighted = false
      }
    }

    // Set new selected cell
    newStates[y][x].isSelected = true

    // Find which word(s) this cell belongs to
    const matchingPlacements = crossword.word_placements.filter((placement) => {
      if (placement.is_across) {
        return (
          y === placement.start_y &&
          x >= placement.start_x &&
          x < placement.start_x + placement.word.length
        )
      }
      return (
        x === placement.start_x &&
        y >= placement.start_y &&
        y < placement.start_y + placement.word.length
      )
    })

    // If cell is part of both across and down words
    if (matchingPlacements.length > 1) {
      const acrossPlacement = matchingPlacements.find((p) => p.is_across)
      const downPlacement = matchingPlacements.find((p) => !p.is_across)

      const targetPlacement = isAcrossMode ? acrossPlacement : downPlacement

      if (targetPlacement) {
        highlightWord(targetPlacement, newStates)
      }
    }
    // If cell is part of only one word
    else if (matchingPlacements.length === 1) {
      highlightWord(matchingPlacements[0], newStates)
      setIsAcrossMode(matchingPlacements[0].is_across)
    }

    setCellStates(newStates)
    setCurrentCell({ x, y })
  }

  // Highlight all cells in a word
  const highlightWord = (
    placement: WordPlacement,
    states: Array<Array<CellState>>
  ) => {
    const { start_x, start_y, is_across, word } = placement

    for (let i = 0; i < word.length; i++) {
      const x = is_across ? start_x + i : start_x
      const y = is_across ? start_y : start_y + i

      states[y][x].isHighlighted = true
    }
  }

  // Move to the next cell in the current direction
  const moveToNextCell = () => {
    if (!currentCell || !crossword) return

    const { x, y } = currentCell

    if (isAcrossMode) {
      // Try to move right
      if (x + 1 < crossword.width && crossword.grid[y][x + 1] !== " ") {
        updateSelection(x + 1, y)
      }
    } else {
      // Try to move down
      if (y + 1 < crossword.height && crossword.grid[y + 1][x] !== " ") {
        updateSelection(x, y + 1)
      }
    }
  }

  // Toggle direction between across and down
  const toggleDirection = () => {
    if (!currentCell) return

    setIsAcrossMode(!isAcrossMode)
    updateSelection(currentCell.x, currentCell.y)
  }

  // Handle key press in the crossword grid
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!currentCell) return

    const { x, y } = currentCell

    // Letter input
    if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
      const newStates = [...cellStates]
      newStates[y][x].value = e.key.toLowerCase()
      setCellStates(newStates)
      moveToNextCell()
    }
    // Backspace
    else if (e.key === "Backspace") {
      const newStates = [...cellStates]
      newStates[y][x].value = ""
      setCellStates(newStates)
    }
    // Arrow keys
    else if (e.key === "ArrowRight" && x + 1 < crossword!.width) {
      updateSelection(x + 1, y)
    } else if (e.key === "ArrowLeft" && x > 0) {
      updateSelection(x - 1, y)
    } else if (e.key === "ArrowDown" && y + 1 < crossword!.height) {
      updateSelection(x, y + 1)
    } else if (e.key === "ArrowUp" && y > 0) {
      updateSelection(x, y - 1)
    }
    // Space to toggle direction
    else if (e.key === " ") {
      toggleDirection()
    }
  }

  // Check if all cells are filled correctly
  const checkCompletion = () => {
    if (!crossword || !cellStates.length) return

    for (let y = 0; y < crossword.height; y++) {
      for (let x = 0; x < crossword.width; x++) {
        if (crossword.grid[y][x] !== " ") {
          // If any cell is empty or incorrect, the puzzle is not complete
          if (cellStates[y][x].value !== crossword.grid[y][x]) {
            setIsComplete(false)
            return
          }
        }
      }
    }

    // All cells are correct
    setIsComplete(true)
  }

  // Add a new word to the list
  const addWord = () => {
    if (!wordInput.trim()) return

    const newWord = wordInput.trim().toLowerCase()
    if (wordList.includes(newWord)) {
      setError("This word is already in the list")
      return
    }

    setWordList([...wordList, newWord])
    setWordInput("")
    setError(null)
  }

  // Remove a word from the list
  const removeWord = (word: string) => {
    setWordList(wordList.filter((w) => w !== word))
  }

  // Reveal the solution for the currently selected word
  const revealWord = () => {
    if (!currentCell || !crossword) return

    const { x, y } = currentCell
    const newStates = [...cellStates]

    // Find the current word
    const matchingPlacements = crossword.word_placements.filter((placement) => {
      if (placement.is_across && isAcrossMode) {
        return (
          y === placement.start_y &&
          x >= placement.start_x &&
          x < placement.start_x + placement.word.length
        )
      } else if (!placement.is_across && !isAcrossMode) {
        return (
          x === placement.start_x &&
          y >= placement.start_y &&
          y < placement.start_y + placement.word.length
        )
      }
      return false
    })

    if (matchingPlacements.length > 0) {
      const placement = matchingPlacements[0]
      const { start_x, start_y, is_across, word } = placement

      for (let i = 0; i < word.length; i++) {
        const cellX = is_across ? start_x + i : start_x
        const cellY = is_across ? start_y : start_y + i

        newStates[cellY][cellX].value = word[i]
        newStates[cellY][cellX].isRevealed = true
      }

      setCellStates(newStates)
    }
  }

  // Reveal the entire puzzle
  const revealAll = () => {
    if (!crossword) return

    const newStates = [...cellStates]

    for (let y = 0; y < crossword.height; y++) {
      for (let x = 0; x < crossword.width; x++) {
        if (crossword.grid[y][x] !== " ") {
          newStates[y][x].value = crossword.grid[y][x]
          newStates[y][x].isRevealed = true
        }
      }
    }

    setCellStates(newStates)
  }

  // Clear all entered letters
  const clearAll = () => {
    if (!cellStates.length) return

    const newStates = cellStates.map((row) =>
      row.map((cell) => ({
        ...cell,
        value: "",
        isRevealed: false,
      }))
    )

    setCellStates(newStates)
    setIsComplete(false)
  }

  // Effect to check completion on cell changes
  useEffect(() => {
    if (cellStates.length > 0) {
      checkCompletion()
    }
  }, [cellStates])

  // Render a cell in the grid
  const renderCell = (cellState: CellState, x: number, y: number) => {
    if (!crossword || crossword.grid[y][x] === " ") {
      return <div key={`${x}-${y}`} className="size-10" />
    }

    const cellClasses = [
      "w-10 h-10 border border-gray-300 flex items-center justify-center font-bold text-xl relative",
      cellState.isSelected ? "bg-blue-300" : "",
      cellState.isHighlighted && !cellState.isSelected ? "bg-blue-100" : "",
      cellState.isRevealed ? "text-red-500" : "",
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <div
        key={`${x}-${y}`}
        className={cellClasses}
        onClick={() => updateSelection(x, y)}
      >
        {cellState.number && (
          <span className="absolute left-0.5 top-0 text-xs">
            {cellState.number}
          </span>
        )}
        {cellState.value.toUpperCase()}
      </div>
    )
  }

  // Display word lists (across and down)
  const renderWordList = () => {
    if (!crossword) return null

    // Separate words into across and down with their assigned numbers
    const wordsByDirection: Record<
      string,
      Array<{ word: string; number: number }>
    > = {
      across: [],
      down: [],
    }

    // Map of start positions to cell numbers
    const positionToNumber: Record<string, number> = {}

    // Extract cell numbers for each position
    cellStates.forEach((row) => {
      row.forEach((cell) => {
        if (cell.number) {
          const x = row.indexOf(cell)
          const y = cellStates.indexOf(row)
          positionToNumber[`${x},${y}`] = cell.number
        }
      })
    })

    // Group words by direction with their numbers
    crossword.word_placements.forEach((placement) => {
      const key = `${placement.start_x},${placement.start_y}`
      const cellNumber = positionToNumber[key] || 0

      if (placement.is_across) {
        wordsByDirection.across.push({
          word: placement.word,
          number: cellNumber,
        })
      } else {
        wordsByDirection.down.push({
          word: placement.word,
          number: cellNumber,
        })
      }
    })

    // Sort by cell number
    wordsByDirection.across.sort((a, b) => a.number - b.number)
    wordsByDirection.down.sort((a, b) => a.number - b.number)

    return (
      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <div>
          <h3 className="text-lg font-bold">Across</h3>
          <ul className="list-none">
            {wordsByDirection.across.map((item, i) => (
              <li key={`across-${i}`} className="mb-1">
                <span className="font-semibold">{item.number}.</span>{" "}
                {item.word}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-bold">Down</h3>
          <ul className="list-none">
            {wordsByDirection.down.map((item, i) => (
              <li key={`down-${i}`} className="mb-1">
                <span className="font-semibold">{item.number}.</span>{" "}
                {item.word}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-2xl font-bold">Crossword Puzzle Generator</h2>

      {/* Word list management */}
      <div className="mb-6 rounded border p-4">
        <h3 className="mb-2 text-lg font-bold">Word List</h3>

        <div className="mb-4 flex flex-wrap gap-2">
          {wordList.map((word) => (
            <div
              key={word}
              className="flex items-center rounded-full bg-blue-100 px-3 py-1"
            >
              <span>{word}</span>
              <button
                onClick={() => removeWord(word)}
                className="ml-2 font-bold text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            className="flex-grow rounded border px-3 py-2"
            placeholder="Add a word..."
          />
          <button
            onClick={addWord}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Add
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-2 block">
            Max Group Size:
            <input
              type="number"
              min="2"
              max="20"
              value={maxGroupSize}
              onChange={(e) => setMaxGroupSize(parseInt(e.target.value))}
              className="ml-2 w-16 rounded border px-2 py-1"
            />
          </label>

          <button
            onClick={generateCrossword}
            className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
          >
            Generate Crossword
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="p-4 text-center">Generating crossword puzzle...</div>
      )}

      {error && <div className="mb-4 text-red-500">{error}</div>}

      {isComplete && (
        <div className="mb-4 rounded border border-green-500 bg-green-100 p-2">
          Congratulations! You've completed the crossword!
        </div>
      )}

      {crossword && !isLoading && (
        <div>
          {/* Crossword controls */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={revealWord}
              className="rounded bg-yellow-500 px-3 py-1 text-white hover:bg-yellow-600"
            >
              Reveal Word
            </button>
            <button
              onClick={revealAll}
              className="rounded bg-yellow-500 px-3 py-1 text-white hover:bg-yellow-600"
            >
              Reveal All
            </button>
            <button
              onClick={clearAll}
              className="rounded bg-gray-500 px-3 py-1 text-white hover:bg-gray-600"
            >
              Clear All
            </button>
            <button
              onClick={toggleDirection}
              className="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
            >
              {isAcrossMode ? "Switch to Down" : "Switch to Across"}
            </button>
          </div>

          {/* Crossword grid */}
          <div
            ref={gridRef}
            className="inline-block overflow-auto border border-gray-400 p-2"
            tabIndex={0}
            onKeyDown={handleKeyPress}
          >
            <div
              className="grid gap-0"
              style={{
                gridTemplateColumns: `repeat(${crossword.width}, minmax(0, 1fr))`,
              }}
            >
              {cellStates.map((row, y) =>
                row.map((cell, x) => renderCell(cell, x, y))
              )}
            </div>
          </div>

          {/* Word lists */}
          {renderWordList()}
        </div>
      )}
    </div>
  )
}
