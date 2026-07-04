import {
  HANGUL_GRID_CELL_COUNT,
  HANGUL_GRID_RADIUS,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import { describe, expect, it } from "vitest"

// Completion mode tests all 40 distinct jamo (see crates/hangul-game-core
// create_game_mode). Because the engine reserves a cell for every completed
// character, the board must hold at least that many, or completion mode
// deadlocks (BoardFull before every character can spawn).
const COMPLETION_MODE_CHARACTER_COUNT = 40

describe("hangul board capacity", () => {
  it("is a radius-4 board of 61 cells", () => {
    expect(HANGUL_GRID_RADIUS).toBe(4)
    expect(HANGUL_GRID_CELL_COUNT).toBe(61)
  })

  it("has enough cells to complete every character with headroom", () => {
    expect(HANGUL_GRID_CELL_COUNT).toBeGreaterThan(
      COMPLETION_MODE_CHARACTER_COUNT
    )
  })
})
