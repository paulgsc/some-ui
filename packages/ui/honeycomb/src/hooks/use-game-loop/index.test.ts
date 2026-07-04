import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import { useGameLoop } from "@honeycomb/hooks/use-game-loop"
import type {
  GameStats,
  SpawnResult,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { CharacterWithLifetime } from "@honeycomb/types/hangul-types"
import { renderHook } from "@testing-library/react"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type UseGameLoopProps = Parameters<typeof useGameLoop>[0]

type ActiveCharactersUpdater = (
  prev: Map<string, Partial<CharacterWithLifetime>>
) => Map<string, Partial<CharacterWithLifetime>>

type MockGameBridge = {
  spawnCharacter: Mock
  checkExpired: Mock
  getTimingParams: Mock
  getCurrentTimeWindow: Mock
  updateStatus: Mock
  createDisplayCharacter: Mock<(spawn: SpawnResult) => unknown>
}

type MockGameLoopProps = {
  gameBridge: MockGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  setActiveCharacters: Mock<(updater: ActiveCharactersUpdater) => void>
  setStats: Mock<(stats: GameStats & { accuracy: number }) => void>
  setTimingParams: Mock<(params: TimingParams) => void>
  playSound: Mock<(event: AudioEvent) => void>
  onBoardFull: Mock<() => void>
}

function createBaseProps(
  overrides: Partial<MockGameLoopProps> = {}
): MockGameLoopProps {
  return {
    gameBridge: {
      spawnCharacter: vi.fn(() => []),
      checkExpired: vi.fn(() => []),
      getTimingParams: vi.fn(() => ({
        spawnIntervalMs: 1000,
        characterLifetimeMs: 3000,
        showRomanization: true,
      })),
      getCurrentTimeWindow: vi.fn(() => 3000),
      updateStatus: vi.fn(),
      createDisplayCharacter: vi.fn((spawn) => ({
        cellId: spawn.cellId,
        hangul: spawn.hangul,
        qwertyKey: spawn.expectedKey,
        romanization: "",
        color: "#000000",
        spawnedAt: spawn.revealedAtMs,
      })),
    },
    isInitialized: true,
    isPaused: false,
    setActiveCharacters: vi.fn(),
    setStats: vi.fn(),
    setTimingParams: vi.fn(),
    playSound: vi.fn(),
    onBoardFull: vi.fn(),
    ...overrides,
  }
}

/**
 * `gameBridge`'s real type (`WasmGameBridge`) has private fields, so a mock
 * that only implements the handful of methods `useGameLoop` calls can never
 * satisfy it structurally. This is the single, documented cast that lets a
 * `MockGameLoopProps` stand in for the hook's real props.
 */
function asGameLoopProps(props: MockGameLoopProps): UseGameLoopProps {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return props as UseGameLoopProps
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("interval wiring", () => {
  it("does not start intervals when not initialized", () => {
    const props = createBaseProps({ isInitialized: false })
    renderHook(() => useGameLoop(asGameLoopProps(props)))

    vi.advanceTimersByTime(5000)

    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })

  it("does not start intervals without a gameBridge", () => {
    const props = createBaseProps({ gameBridge: null })
    renderHook(() => useGameLoop(asGameLoopProps(props)))

    vi.advanceTimersByTime(5000)

    expect(props.setActiveCharacters).not.toHaveBeenCalled()
  })

  it("spawns on the configured interval while running", () => {
    const props = createBaseProps()
    renderHook(() => useGameLoop(asGameLoopProps(props)))

    vi.advanceTimersByTime(1000)

    expect(props.gameBridge!.spawnCharacter).toHaveBeenCalledTimes(1)
  })

  it("stops spawning once isPaused flips true, without tearing down the interval", () => {
    const props = createBaseProps()
    const { rerender } = renderHook(
      (p: MockGameLoopProps) => useGameLoop(asGameLoopProps(p)),
      { initialProps: props }
    )

    rerender({ ...props, isPaused: true })
    vi.advanceTimersByTime(2000)

    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })

  it("clears both intervals on unmount", () => {
    const props = createBaseProps()
    const { unmount } = renderHook(() => useGameLoop(asGameLoopProps(props)))

    unmount()
    vi.advanceTimersByTime(5000)

    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })
})

describe("spawn loop event handling", () => {
  it("adds a spawned character and plays the spawn sound", () => {
    const spawnResult = {
      cellId: "cell-1",
      hangul: "ㄱ",
      expectedKey: "r",
      revealedAtMs: 0,
      playSpawnSound: true,
    }
    const props = createBaseProps()
    props.gameBridge!.spawnCharacter = vi.fn(() => [
      { type: "characterSpawned", spawnResult },
    ])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(1000)

    expect(props.playSound).toHaveBeenCalledWith("character_spawn")
    // The 50ms update-loop interval also calls setActiveCharacters (decay, a
    // no-op on an empty map) within this window, so find the call that
    // actually added the spawned character rather than assuming index 0.
    const results = props.setActiveCharacters.mock.calls.map(([updater]) =>
      updater(new Map())
    )
    const withSpawn = results.find((map) => map.has("cell-1"))
    expect(withSpawn?.get("cell-1")).toMatchObject({
      cellId: "cell-1",
      timeRemaining: 1,
    })
  })

  it("does not play the spawn sound when playSpawnSound is false", () => {
    const props = createBaseProps()
    props.gameBridge!.spawnCharacter = vi.fn(() => [
      {
        type: "characterSpawned",
        spawnResult: {
          cellId: "cell-1",
          hangul: "ㄱ",
          expectedKey: "r",
          revealedAtMs: 0,
          playSpawnSound: false,
        },
      },
    ])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(1000)

    expect(props.playSound).not.toHaveBeenCalledWith("character_spawn")
  })

  it("calls onBoardFull when the board is full", () => {
    const props = createBaseProps()
    props.gameBridge!.spawnCharacter = vi.fn(() => [{ type: "boardFull" }])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(1000)

    expect(props.onBoardFull).toHaveBeenCalled()
  })

  it("plays the difficulty-increase sound and refreshes timing on difficultyChanged", () => {
    const timing = {
      spawnIntervalMs: 800,
      characterLifetimeMs: 2000,
      showRomanization: false,
    }
    const props = createBaseProps()
    props.gameBridge!.spawnCharacter = vi.fn(() => [
      { type: "difficultyChanged" },
    ])
    props.gameBridge!.getTimingParams = vi.fn(() => timing)

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(1000)

    expect(props.playSound).toHaveBeenCalledWith("difficulty_increase")
    expect(props.setTimingParams).toHaveBeenCalledWith(timing)
  })
})

describe("update loop event handling", () => {
  it("removes expired characters and plays the expire sound", () => {
    const props = createBaseProps()
    props.gameBridge!.checkExpired = vi.fn(() => [
      {
        type: "charactersExpired",
        cellIds: ["cell-1"],
        hanguls: ["ㄱ"],
        count: 1,
      },
    ])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(50)

    expect(props.playSound).toHaveBeenCalledWith("character_expire")
    const updater = props.setActiveCharacters.mock.calls[0]![0]
    const prev = new Map([
      ["cell-1", { cellId: "cell-1" }],
      ["cell-2", { cellId: "cell-2" }],
    ])
    const next = updater(prev)
    expect(next.has("cell-1")).toBe(false)
    expect(next.has("cell-2")).toBe(true)
  })

  it("does not play the expire sound when nothing expired", () => {
    const props = createBaseProps()
    props.gameBridge!.checkExpired = vi.fn(() => [
      { type: "charactersExpired", cellIds: [], hanguls: [], count: 0 },
    ])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(50)

    expect(props.playSound).not.toHaveBeenCalledWith("character_expire")
  })

  it("computes accuracy and sets stats on statsUpdated", () => {
    const props = createBaseProps()
    props.gameBridge!.checkExpired = vi.fn(() => [
      {
        type: "statsUpdated",
        stats: {
          totalCorrect: 3,
          totalMissed: 1,
          score: 30,
          currentStreak: 3,
          bestStreak: 3,
        },
      },
    ])

    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(50)

    expect(props.setStats).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: 75 })
    )
  })

  it("decays timeRemaining for unsolved characters based on the current window", () => {
    const props = createBaseProps()
    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(50)

    const updater = props.setActiveCharacters.mock.calls[0]![0]
    const prev = new Map([
      [
        "cell-1",
        {
          cellId: "cell-1",
          spawnedAt: Date.now() - 1500,
          isSolved: false,
          timeRemaining: 1,
        },
      ],
    ])
    const next = updater(prev)
    expect(next.get("cell-1")!.timeRemaining).toBeCloseTo(0.5, 5)
  })

  it("does not decay timeRemaining for solved characters", () => {
    const props = createBaseProps()
    renderHook(() => useGameLoop(asGameLoopProps(props)))
    vi.advanceTimersByTime(50)

    const updater = props.setActiveCharacters.mock.calls[0]![0]
    const prev = new Map([
      [
        "cell-1",
        {
          cellId: "cell-1",
          spawnedAt: Date.now() - 1500,
          isSolved: true,
          timeRemaining: 0.42,
        },
      ],
    ])
    const next = updater(prev)
    expect(next.get("cell-1")!.timeRemaining).toBe(0.42)
  })

  it("calls bridge.updateStatus on every tick", () => {
    const props = createBaseProps()
    renderHook(() => useGameLoop(asGameLoopProps(props)))

    vi.advanceTimersByTime(50)

    expect(props.gameBridge!.updateStatus).toHaveBeenCalled()
  })
})
