import type { AudioEvent } from "@honeycomb/hooks/use-game-audio"
import { useGameLoop } from "@honeycomb/hooks/use-game-loop"
import type {
  GameStats,
  SpawnResult,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  CharacterWithLifetime,
  MissedWord,
  WordProgress,
} from "@honeycomb/types/hangul-types"
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
  createDisplayCharacters: Mock<(spawn: SpawnResult) => Array<unknown>>
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
  wordProgress: WordProgress | null
  setWordProgress: Mock<(progress: WordProgress | null) => void>
  onWordMissed: Mock<(missed: MissedWord) => void>
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
      createDisplayCharacters: vi.fn((spawn) => [
        {
          cellId: spawn.cellId,
          cellIds: spawn.cellIds,
          hangul: spawn.hangul,
          qwertyKey: spawn.expectedKey,
          romanization: "",
          color: "#000000",
          spawnedAt: spawn.revealedAtMs,
          stimulus: spawn.stimulus,
          answerKeys: spawn.answerKeys,
          answerGlyphs: spawn.answerGlyphs,
          tokenIndex: 0,
          cursor: 0,
        },
      ]),
    },
    isInitialized: true,
    isPaused: false,
    setActiveCharacters: vi.fn(),
    setStats: vi.fn(),
    setTimingParams: vi.fn(),
    playSound: vi.fn(),
    onBoardFull: vi.fn(),
    wordProgress: null,
    setWordProgress: vi.fn(),
    onWordMissed: vi.fn(),
    ...overrides,
  }
}

/**
 * `WasmGameBridge` has private fields, so no mock satisfies it structurally;
 * this is the one cast that lets a mock stand in.
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

function renderLoop(props: MockGameLoopProps): void {
  renderHook(() => useGameLoop(asGameLoopProps(props)))
}

function renderRerenderable(props: MockGameLoopProps): {
  rerender: (props: MockGameLoopProps) => void
  unmount: () => void
} {
  return renderHook((p: MockGameLoopProps) => useGameLoop(asGameLoopProps(p)), {
    initialProps: props,
  })
}

function jamoSpawn(overrides: Partial<SpawnResult> = {}): SpawnResult {
  return {
    cellId: "cell-1",
    cellIds: ["cell-1"],
    hangul: "ㄱ",
    expectedKey: "r",
    stimulus: { kind: "glyph", text: "ㄱ" },
    answerKeys: ["r"],
    answerGlyphs: ["ㄱ"],
    revealedAtMs: 0,
    playSpawnSound: false,
    ...overrides,
  }
}

const WORD_SPAWN = jamoSpawn({
  cellId: "cell-a",
  cellIds: ["cell-a", "cell-b"],
  hangul: "ㅅㅏ",
  expectedKey: "t",
  stimulus: { kind: "icon", name: "apple" },
  answerKeys: ["t", "k"],
  answerGlyphs: ["ㅅ", "ㅏ"],
})

const IN_FLIGHT: WordProgress = {
  cellIds: ["cell-a", "cell-b"],
  answerGlyphs: ["ㅅ", "ㅏ"],
  cursor: 0,
}

function spawning(props: MockGameLoopProps, events: Array<unknown>): void {
  props.gameBridge!.spawnCharacter = vi.fn(() => events)
}

function expiring(
  props: MockGameLoopProps,
  cellIds: Array<string>,
  hanguls: Array<string>,
  count: number
): void {
  props.gameBridge!.checkExpired = vi.fn(() => [
    { type: "charactersExpired", cellIds, hanguls, count },
  ])
}

/** The first `setActiveCharacters` updater, after one update tick. */
function firstUpdater(props: MockGameLoopProps): ActiveCharactersUpdater {
  return props.setActiveCharacters.mock.calls[0]![0]
}

/** `timeRemaining` after one update tick decays a character spawned 1500ms ago. */
function decayed(
  character: Partial<CharacterWithLifetime>
): number | undefined {
  const props = createBaseProps()
  renderLoop(props)
  vi.advanceTimersByTime(50)
  const next = firstUpdater(props)(
    new Map([
      [
        "cell-1",
        { cellId: "cell-1", spawnedAt: Date.now() - 1500, ...character },
      ],
    ])
  )
  return next.get("cell-1")!.timeRemaining
}

describe("interval wiring", () => {
  it("does not start intervals when not initialized", () => {
    const props = createBaseProps({ isInitialized: false })
    renderLoop(props)
    vi.advanceTimersByTime(5000)
    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })

  it("does not start intervals without a gameBridge", () => {
    const props = createBaseProps({ gameBridge: null })
    renderLoop(props)
    vi.advanceTimersByTime(5000)
    expect(props.setActiveCharacters).not.toHaveBeenCalled()
  })

  it("spawns on the configured interval while running", () => {
    const props = createBaseProps()
    renderLoop(props)
    vi.advanceTimersByTime(1000)
    expect(props.gameBridge!.spawnCharacter).toHaveBeenCalledTimes(1)
  })

  it("stops spawning once isPaused flips true, without tearing down the interval", () => {
    const props = createBaseProps()
    const { rerender } = renderRerenderable(props)
    rerender({ ...props, isPaused: true })
    vi.advanceTimersByTime(2000)
    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })

  it("clears both intervals on unmount", () => {
    const props = createBaseProps()
    const { unmount } = renderRerenderable(props)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })
})

describe("spawn loop event handling", () => {
  it("adds a spawned character and plays the spawn sound", () => {
    const props = createBaseProps()
    spawning(props, [
      {
        type: "characterSpawned",
        spawnResult: jamoSpawn({ playSpawnSound: true }),
      },
    ])
    renderLoop(props)
    vi.advanceTimersByTime(1000)

    expect(props.playSound).toHaveBeenCalledWith("character_spawn")
    // The 50ms update loop also calls setActiveCharacters in this window, so
    // find the call that added the character rather than assuming index 0.
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
    spawning(props, [{ type: "characterSpawned", spawnResult: jamoSpawn() }])
    renderLoop(props)
    vi.advanceTimersByTime(1000)
    expect(props.playSound).not.toHaveBeenCalledWith("character_spawn")
  })

  it("calls onBoardFull when the board is full", () => {
    const props = createBaseProps()
    spawning(props, [{ type: "boardFull" }])
    renderLoop(props)
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
    spawning(props, [{ type: "difficultyChanged" }])
    props.gameBridge!.getTimingParams = vi.fn(() => timing)
    renderLoop(props)
    vi.advanceTimersByTime(1000)

    expect(props.playSound).toHaveBeenCalledWith("difficulty_increase")
    expect(props.setTimingParams).toHaveBeenCalledWith(timing)
  })
})

describe("update loop event handling", () => {
  it("removes expired characters and plays the expire sound", () => {
    const props = createBaseProps()
    expiring(props, ["cell-1"], ["ㄱ"], 1)
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.playSound).toHaveBeenCalledWith("character_expire")
    const next = firstUpdater(props)(
      new Map([
        ["cell-1", { cellId: "cell-1" }],
        ["cell-2", { cellId: "cell-2" }],
      ])
    )
    expect(next.has("cell-1")).toBe(false)
    expect(next.has("cell-2")).toBe(true)
  })

  it("does not play the expire sound when nothing expired", () => {
    const props = createBaseProps()
    expiring(props, [], [], 0)
    renderLoop(props)
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
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.setStats).toHaveBeenCalledWith(
      expect.objectContaining({ accuracy: 75 })
    )
  })

  it("decays timeRemaining for unsolved characters based on the current window", () => {
    expect(
      decayed({ isSolved: false, timeRemaining: 1, answerKeys: ["r"] })
    ).toBeCloseTo(0.5, 5)
  })

  it("scales the decay window by token count for a multi-token challenge", () => {
    // 2 tokens * 3000ms = 6000ms budget: 1500ms elapsed is a quarter.
    expect(
      decayed({ isSolved: false, timeRemaining: 1, answerKeys: ["t", "k"] })
    ).toBeCloseTo(0.75, 5)
  })

  it("does not decay timeRemaining for solved characters", () => {
    expect(
      decayed({ isSolved: true, timeRemaining: 0.42, answerKeys: ["r"] })
    ).toBe(0.42)
  })

  it("calls bridge.updateStatus on every tick", () => {
    const props = createBaseProps()
    renderLoop(props)
    vi.advanceTimersByTime(50)
    expect(props.gameBridge!.updateStatus).toHaveBeenCalled()
  })
})

describe("word progress tracking", () => {
  it("tracks a multi-token spawn for the masked-word overlay", () => {
    const props = createBaseProps()
    spawning(props, [{ type: "characterSpawned", spawnResult: WORD_SPAWN }])
    renderLoop(props)
    vi.advanceTimersByTime(1000)

    expect(props.setWordProgress).toHaveBeenCalledWith(IN_FLIGHT)
  })

  it("does not track a single-jamo (n=1) spawn", () => {
    const props = createBaseProps()
    spawning(props, [
      {
        type: "characterSpawned",
        spawnResult: jamoSpawn({ cellId: "cell-a", cellIds: ["cell-a"] }),
      },
    ])
    renderLoop(props)
    vi.advanceTimersByTime(1000)

    expect(props.setWordProgress).not.toHaveBeenCalled()
  })

  it("clears tracked word progress when its cells expire", () => {
    const props = createBaseProps()
    spawning(props, [{ type: "characterSpawned", spawnResult: WORD_SPAWN }])
    expiring(props, ["cell-a", "cell-b"], ["ㅅㅏ"], 1)

    const { rerender } = renderRerenderable(props)
    vi.advanceTimersByTime(1000) // spawn tick

    // As in the real parent, the progress it set flows back in as a prop.
    const tracked = props.setWordProgress.mock.calls[0]![0]
    rerender({ ...props, wordProgress: tracked })

    vi.advanceTimersByTime(50) // update tick picks up the expiry

    expect(props.setWordProgress).toHaveBeenLastCalledWith(null)
  })

  it("reports a tracked word that expired unfinished, and keeps its cells for the debrief", () => {
    const wordProgress: WordProgress = {
      cellIds: ["cell-a", "cell-b", "cell-c"],
      answerGlyphs: ["ㅅ", "ㅏ", "ㄱ"],
      cursor: 1,
    }
    const props = createBaseProps({ wordProgress })
    expiring(
      props,
      ["cell-a", "cell-b", "cell-c", "unrelated-jamo"],
      ["ㅅㅏㄱ", "ㄴ"],
      4
    )
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.onWordMissed).toHaveBeenCalledWith(wordProgress)

    const next = firstUpdater(props)(
      new Map([
        ["cell-a", { cellId: "cell-a", timeRemaining: 0.1 }],
        ["cell-b", { cellId: "cell-b", timeRemaining: 0.1 }],
        ["cell-c", { cellId: "cell-c", timeRemaining: 0.1 }],
        ["unrelated-jamo", { cellId: "unrelated-jamo", timeRemaining: 0.1 }],
      ])
    )

    // The word's cells survive, flagged and frozen; other expiries drop.
    expect(next.get("cell-a")).toMatchObject({
      isMissed: true,
      timeRemaining: 0,
    })
    expect(next.get("cell-c")).toMatchObject({ isMissed: true })
    expect(next.has("unrelated-jamo")).toBe(false)
  })

  it("does not report a miss for a word whose every jamo was typed", () => {
    const props = createBaseProps({ wordProgress: { ...IN_FLIGHT, cursor: 2 } })
    expiring(props, ["cell-a", "cell-b"], ["ㅅㅏ"], 2)
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.onWordMissed).not.toHaveBeenCalled()
    const next = firstUpdater(props)(
      new Map([["cell-a", { cellId: "cell-a" }]])
    )
    expect(next.has("cell-a")).toBe(false)
  })

  it("does not report a miss for single-jamo play, which has no tracked word", () => {
    const props = createBaseProps()
    expiring(props, ["cell-1"], ["ㄱ"], 1)
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.onWordMissed).not.toHaveBeenCalled()
  })

  it("does not report a miss when some other cell expires mid-word", () => {
    const props = createBaseProps({ wordProgress: IN_FLIGHT })
    expiring(props, ["some-other-cell"], ["ㄴ"], 1)
    renderLoop(props)
    vi.advanceTimersByTime(50)

    expect(props.onWordMissed).not.toHaveBeenCalled()
    expect(props.setWordProgress).not.toHaveBeenCalled()
  })

  it("leaves a missed cell's countdown alone instead of decaying it", () => {
    expect(
      decayed({ isMissed: true, timeRemaining: 0, answerKeys: ["t", "k"] })
    ).toBe(0)
  })

  it("does not spawn a new challenge while a word challenge is already in flight (queue semantics)", () => {
    const props = createBaseProps({ wordProgress: IN_FLIGHT })
    renderLoop(props)
    vi.advanceTimersByTime(1000)
    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()
  })

  it("resumes spawning once the tracked word progress clears", () => {
    const props = createBaseProps({ wordProgress: IN_FLIGHT })
    const { rerender } = renderRerenderable(props)
    vi.advanceTimersByTime(1000)
    expect(props.gameBridge!.spawnCharacter).not.toHaveBeenCalled()

    rerender({ ...props, wordProgress: null })
    vi.advanceTimersByTime(1000)
    expect(props.gameBridge!.spawnCharacter).toHaveBeenCalledTimes(1)
  })
})
