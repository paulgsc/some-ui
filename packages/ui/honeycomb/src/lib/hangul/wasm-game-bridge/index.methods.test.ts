import {
  HANGUL_GRID_CELL_COUNT,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { HangulGameCore } from "hangul-game-core"
import { describe, expect, it, vi } from "vitest"

function makeStatus(
  overrides: Partial<{
    isComplete: boolean
    isTimedOut: boolean
    timeRemainingMs: number
    completedKeys: number
  }> = {}
): unknown {
  const completedKeys = overrides.completedKeys ?? 0
  return {
    isComplete: overrides.isComplete ?? false,
    isTimedOut: overrides.isTimedOut ?? false,
    timeRemainingMs: overrides.timeRemainingMs ?? 60000,
    progress: {
      totalKeys: 10,
      completedKeys,
      remainingKeys: 10 - completedKeys,
      completionPercentage: 0,
      keysCompletedList: [],
    },
  }
}

function makeCore(overrides: Record<string, unknown> = {}): any {
  return {
    getGameStatus: vi.fn(() => makeStatus()),
    startTimer: vi.fn(),
    reset: vi.fn(),
    processKeyPress: vi.fn(() => []),
    checkExpired: vi.fn(() => []),
    spawnCharacter: vi.fn(() => []),
    getStats: vi.fn(() => ({
      score: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalCorrect: 0,
      totalMissed: 0,
    })),
    getTimingParams: vi.fn(() => ({
      spawnIntervalMs: 1000,
      characterLifetimeMs: 3000,
      showRomanization: true,
    })),
    getCurrentTimeWindow: vi.fn(() => 3000),
    getActiveCount: vi.fn(() => 0),
    ...overrides,
  }
}

describe("status subscription dedup", () => {
  it("notifies listeners only when the status actually changes", () => {
    const core = makeCore({
      getGameStatus: vi
        .fn()
        .mockReturnValueOnce(makeStatus({ completedKeys: 0 }))
        .mockReturnValueOnce(makeStatus({ completedKeys: 0 }))
        .mockReturnValueOnce(makeStatus({ completedKeys: 1 })),
    })
    const bridge = new WasmGameBridge(core as HangulGameCore)
    const listener = vi.fn()
    bridge.subscribeToStatus(listener)

    bridge.updateStatus() // lastStatus starts null -> always notifies
    bridge.updateStatus() // identical status -> no notification
    bridge.updateStatus() // completedKeys changed -> notifies

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("stops notifying once unsubscribed", () => {
    const core = makeCore()
    const bridge = new WasmGameBridge(core as HangulGameCore)
    const listener = vi.fn()
    const unsubscribe = bridge.subscribeToStatus(listener)

    unsubscribe()
    bridge.updateStatus()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe("generateCellIds", () => {
  it("enumerates the full board as distinct, zero-summing cube coordinates", () => {
    const core = makeCore()
    const bridge = new WasmGameBridge(core as HangulGameCore)

    bridge.spawnCharacter()

    const cellIds = core.spawnCharacter.mock.calls[0][1] as Array<string>

    expect(cellIds).toHaveLength(HANGUL_GRID_CELL_COUNT)
    expect(new Set(cellIds).size).toBe(HANGUL_GRID_CELL_COUNT)

    for (const id of cellIds) {
      const match = /^hex_(-?\d+)_(-?\d+)_(-?\d+)$/.exec(id)
      expect(match).not.toBeNull()
      const [x, y, z] = [
        Number(match![1]),
        Number(match![2]),
        Number(match![3]),
      ]
      expect(x + y + z).toBe(0)
    }
  })
})

describe("createDisplayCharacter", () => {
  it("maps a known hangul to its qwerty key and romanization", () => {
    const bridge = new WasmGameBridge(makeCore() as HangulGameCore)

    const display = bridge.createDisplayCharacter({
      cellId: "hex_0_0_0",
      hangul: "ㄱ",
      expectedKey: "r",
      revealedAtMs: 1000,
      playSpawnSound: true,
    })

    expect(display.cellId).toBe("hex_0_0_0")
    expect(display.qwertyKey).toBe("r")
    expect(display.romanization).toBe("g/k")
    expect(display.spawnedAt).toBe(1000)
    expect(display.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it("falls back to empty romanization for an unmapped hangul", () => {
    const bridge = new WasmGameBridge(makeCore() as HangulGameCore)

    const display = bridge.createDisplayCharacter({
      cellId: "hex_0_0_0",
      hangul: "not-a-real-jamo",
      expectedKey: "",
      revealedAtMs: 500,
      playSpawnSound: false,
    })

    expect(display.romanization).toBe("")
  })
})

describe("getStats", () => {
  it("computes accuracy from correct and missed counts", () => {
    const core = makeCore({
      getStats: vi.fn(() => ({
        score: 100,
        currentStreak: 3,
        bestStreak: 5,
        totalCorrect: 8,
        totalMissed: 2,
      })),
    })
    const bridge = new WasmGameBridge(core as HangulGameCore)

    expect(bridge.getStats().accuracy).toBe(80)
  })

  it("reports zero accuracy when nothing has been attempted yet", () => {
    const bridge = new WasmGameBridge(makeCore() as HangulGameCore)

    expect(bridge.getStats().accuracy).toBe(0)
  })
})
