import type { Word } from "@input/types/crossword"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCrossword, shuffleArray } from "./crossword-grid"

/** Reconstructs the (x, y) -> letter cells a placed word occupies. */
function cellsForWord(word: Word): Map<string, string> {
  const cells = new Map<string, string>()
  const text = word.word ?? ""
  for (let i = 0; i < word.length; i++) {
    const x = word.direction === "across" ? word.x + i : word.x
    const y = word.direction === "down" ? word.y + i : word.y
    const letter = text[i]
    if (letter !== undefined) cells.set(`${x}-${y}`, letter)
  }
  return cells
}

describe("shuffleArray", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns a permutation containing the same elements", () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffleArray(input)
    expect(result).toHaveLength(input.length)
    expect([...result].sort()).toEqual([...input].sort())
  })

  it("does not mutate the input array", () => {
    const input = [1, 2, 3]
    shuffleArray(input)
    expect(input).toEqual([1, 2, 3])
  })

  it("produces a deterministic order for a fixed random sequence", () => {
    // Fisher-Yates from i=len-1 downto 1, j = floor(random * (i+1)).
    // Feeding a fixed sequence pins the exact resulting permutation.
    const sequence = [0.9, 0.1, 0.5]
    let call = 0
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++] ?? 0)

    // len=4: i=3 j=floor(0.9*4)=3 (swap 3,3 no-op)
    //        i=2 j=floor(0.1*3)=0 (swap 2,0)
    //        i=1 j=floor(0.5*2)=1 (swap 1,1 no-op)
    expect(shuffleArray(["a", "b", "c", "d"])).toEqual(["c", "b", "a", "d"])
  })
})

describe("createCrossword: degenerate inputs", () => {
  it("returns the empty fallback for an empty word list", () => {
    expect(createCrossword([])).toEqual({ words: [], grid: [], size: 0 })
  })

  it("returns the empty fallback when every word is blank", () => {
    expect(createCrossword(["", "   ", ""])).toEqual({
      words: [],
      grid: [],
      size: 0,
    })
  })

  it("dedupes exact duplicate words to a single placement", () => {
    const result = createCrossword(["dog", "dog", "dog"])
    expect("crosswordGrid" in result).toBe(true)
    if (!("crosswordGrid" in result)) throw new Error("unreachable")
    expect(result.crosswordGrid.words).toHaveLength(1)
    expect(result.crosswordGrid.words[0]?.word).toBe("dog")
  })

  it("filters out words too long to fit the (2x maxWordLength, capped) grid", () => {
    const tooLong = "x".repeat(40) // gridSize default 15 -> virtualGridSize caps at 30
    const result = createCrossword([tooLong])

    expect("crosswordGrid" in result).toBe(true)
    if (!("crosswordGrid" in result)) throw new Error("unreachable")
    expect(result.crosswordGrid.words).toEqual([])
    expect(result.grid).toEqual([])
  })

  it("places a single word deterministically regardless of direction", () => {
    const result = createCrossword(["hello"])
    if (!("crosswordGrid" in result)) throw new Error("unreachable")

    expect(result.crosswordGrid.words).toHaveLength(1)
    const placed = result.crosswordGrid.words[0]
    if (!placed) throw new Error("unreachable")
    expect(placed.word).toBe("hello")
    expect(placed.length).toBe(5)
    expect(placed.clueNumber).toBe(1)

    const cells = cellsForWord(placed)
    expect(cells.size).toBe(5)
    expect(result.grid).toHaveLength(5)
    for (const cell of result.grid) {
      expect(cells.get(`${cell.x}-${cell.y}`)).toBe(cell.letter)
    }
  })
})

describe("createCrossword: intersection consistency", () => {
  const words = ["cat", "car", "art"]

  it("agrees on the shared letter at every intersection, across many random runs", () => {
    for (let run = 0; run < 25; run++) {
      const result = createCrossword(words)
      if (!("crosswordGrid" in result)) throw new Error("unreachable")

      const placed = result.crosswordGrid.words
      expect(placed.length).toBeGreaterThan(0)
      expect(placed.length).toBeLessThanOrEqual(words.length)

      // Every placed word must be one of the requested words, placed once.
      const placedTexts = placed.map((w) => w.word)
      expect(new Set(placedTexts).size).toBe(placedTexts.length)
      for (const text of placedTexts) {
        expect(words).toContain(text)
      }

      // Merge every word's occupied cells; a conflicting letter at a shared
      // cell means two crossing words disagree — exactly what canPlaceWord's
      // intersection check exists to prevent.
      const merged = new Map<string, string>()
      for (const word of placed) {
        for (const [key, letter] of cellsForWord(word)) {
          const existing = merged.get(key)
          if (existing !== undefined) {
            expect(existing).toBe(letter)
          }
          merged.set(key, letter)
        }
      }

      // The `grid` cells must reconstruct exactly from `crosswordGrid.words`.
      expect(result.grid).toHaveLength(merged.size)
      for (const cell of result.grid) {
        expect(merged.get(`${cell.x}-${cell.y}`)).toBe(cell.letter)
      }
    }
  })

  it("matches the golden fixture for a fixed random sequence", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const result = createCrossword(words)
    expect(result).toMatchSnapshot()
  })
})
