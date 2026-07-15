import type {
  ConversationBatch,
  ITopikRepository,
  TopikMetadata,
} from "@topik/lib/topik"
import type {
  IQueryBridge,
  ISessionMachine,
  SessionState,
} from "@topik/lib/topik/core/session-types"
import type { TTSOptions, UseAudioTTSReturn } from "some-ui-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createEffectExecutor, type EffectExecutor } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function createFakeQueryBridge(
  overrides: Partial<IQueryBridge> = {}
): IQueryBridge {
  return {
    fetchCatalog: vi.fn().mockResolvedValue({ version: "1", topiks: [] }),
    fetchTopik: vi.fn().mockResolvedValue([]),
    getCachedTopik: vi.fn().mockReturnValue(undefined),
    ...overrides,
  }
}

/** Stub machine: dispatch is a spy that never itself triggers new effects. */
function createFakeMachine(state: SessionState): ISessionMachine {
  return {
    getState: vi.fn(() => state),
    dispatch: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  }
}

function makeTopikMetadata(key: string): TopikMetadata {
  return {
    key,
    displayName: `Topik ${key}`,
    description: "fixture",
    batchCount: 1,
    totalQuestions: 1,
    totalMessages: 1,
  }
}

function makeBatchWithMessage(content: string): ConversationBatch {
  return {
    id: 0,
    messages: [
      {
        id: "m0",
        role: "assistant",
        content,
        timestamp: new Date(2024, 0, 1).toISOString(),
        korean: "안녕",
        english: "hello",
      },
    ],
    questions: [],
  }
}

function activeStateWithBatch(batch: ConversationBatch): SessionState {
  return {
    phase: "active",
    dataRef: {
      catalog: { status: "idle", data: null, error: null },
      topikKey: "k1",
      batches: [batch],
      status: "ready",
      error: null,
      batchCount: 1,
      currentBatchMeta: {
        id: batch.id,
        messageCount: batch.messages.length,
        questionCount: batch.questions.length,
      },
    },
    active: {
      mode: "chat",
      playState: "running",
      quizStage: "question",
      cursor: { batch: 0, message: 0, question: 0 },
      score: 0,
      timeRemaining: 0,
    },
    feedback: null,
    hydrationEpoch: 1,
    sessionEpoch: 1,
  }
}

function emptyActiveState(): SessionState {
  return {
    phase: "active",
    dataRef: {
      catalog: { status: "idle", data: null, error: null },
      topikKey: null,
      batches: null,
      status: "empty",
      error: null,
      batchCount: 0,
      currentBatchMeta: null,
    },
    active: null,
    feedback: null,
    hydrationEpoch: 0,
    sessionEpoch: 0,
  }
}

function createFakeAudioTTS(): UseAudioTTSReturn {
  let pendingOptions: TTSOptions = {}
  return {
    speak: vi.fn((_content: string) => {
      pendingOptions.onStart?.()
      return Promise.resolve()
    }),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    updateOptions: vi.fn((opts: TTSOptions) => {
      pendingOptions = opts
    }),
    speaking: false,
    paused: false,
    loading: false,
    supported: true,
    currentTime: 0,
    duration: 0,
    voices: [],
    selectedVoice: null,
    setSelectedVoice: vi.fn(),
  }
}

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/**
 * `repository` is threaded through EffectExecutorConfig but never read by
 * the executor itself (queries go through `queryBridge` instead), so an
 * empty placeholder that satisfies the type is enough.
 */
function makeFakeRepository(): ITopikRepository {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as ITopikRepository
}

const fakeRepository = makeFakeRepository()

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("EffectExecutor", () => {
  let executor: EffectExecutor | undefined

  afterEach(() => {
    executor?.destroy()
    executor = undefined
    vi.useRealTimers()
  })

  describe("dispatch switch - query effects", () => {
    it("TRIGGER_CATALOG_QUERY dispatches loading then success on resolve", async () => {
      const machine = createFakeMachine(emptyActiveState())
      const topiks = [makeTopikMetadata("t1")]
      const queryBridge = createFakeQueryBridge({
        fetchCatalog: vi.fn().mockResolvedValue({ version: "1", topiks }),
      })
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge,
        enableTTS: false,
      })

      executor.execute([{ type: "TRIGGER_CATALOG_QUERY" }])
      expect(machine.dispatch).toHaveBeenCalledWith({ type: "CATALOG_LOADING" })

      await flushAsync()
      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "CATALOG_SUCCESS",
        data: topiks,
      })
    })

    it("TRIGGER_CATALOG_QUERY dispatches CATALOG_FAILURE when the fetch rejects", async () => {
      const machine = createFakeMachine(emptyActiveState())
      const queryBridge = createFakeQueryBridge({
        fetchCatalog: vi.fn().mockRejectedValue(new Error("network down")),
      })
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge,
        enableTTS: false,
      })

      executor.execute([{ type: "TRIGGER_CATALOG_QUERY" }])
      await flushAsync()

      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "CATALOG_FAILURE",
        error: "network down",
      })
    })

    it("TRIGGER_TOPIK_QUERY dispatches started then success on resolve", async () => {
      const machine = createFakeMachine(emptyActiveState())
      const batches = [makeBatchWithMessage("hello")]
      const queryBridge = createFakeQueryBridge({
        fetchTopik: vi.fn().mockResolvedValue(batches),
      })
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge,
        enableTTS: false,
      })

      executor.execute([{ type: "TRIGGER_TOPIK_QUERY", key: "k1" }])
      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "HYDRATION_STARTED",
        key: "k1",
      })

      await flushAsync()
      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "HYDRATION_SUCCESS",
        key: "k1",
        batches,
      })
    })

    it("TRIGGER_TOPIK_QUERY dispatches HYDRATION_FAILURE when the fetch rejects", async () => {
      const machine = createFakeMachine(emptyActiveState())
      const queryBridge = createFakeQueryBridge({
        fetchTopik: vi.fn().mockRejectedValue(new Error("404")),
      })
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge,
        enableTTS: false,
      })

      executor.execute([{ type: "TRIGGER_TOPIK_QUERY", key: "k1" }])
      await flushAsync()

      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "HYDRATION_FAILURE",
        key: "k1",
        error: "404",
      })
    })
  })

  describe("dispatch switch - timer effects + idempotency", () => {
    it("START_TIMER dispatches TIMER_TICK on every interval", () => {
      vi.useFakeTimers()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        timerInterval: 1000,
      })

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(3000)

      const tickCalls = vi
        .mocked(machine.dispatch)
        .mock.calls.filter(([event]) => event.type === "TIMER_TICK")
      expect(tickCalls).toHaveLength(3)
    })

    it("a second START_TIMER is a no-op while a timer is already running", () => {
      vi.useFakeTimers()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        timerInterval: 1000,
      })

      executor.execute([{ type: "START_TIMER" }])
      executor.execute([{ type: "START_TIMER" }]) // duplicate - must not create a 2nd interval
      vi.advanceTimersByTime(1000)

      const tickCalls = vi
        .mocked(machine.dispatch)
        .mock.calls.filter(([event]) => event.type === "TIMER_TICK")
      expect(tickCalls).toHaveLength(1) // would be 2 if idempotency were broken
    })

    it("STOP_TIMER stops ticking and allows a later START_TIMER to restart it", () => {
      vi.useFakeTimers()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        timerInterval: 1000,
      })

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(1000)
      executor.execute([{ type: "STOP_TIMER" }])
      vi.advanceTimersByTime(5000) // no ticks should occur while stopped

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(1000)

      const tickCalls = vi
        .mocked(machine.dispatch)
        .mock.calls.filter(([event]) => event.type === "TIMER_TICK")
      expect(tickCalls).toHaveLength(2)
    })
  })

  describe("dispatch switch - TTS effects", () => {
    it("PLAY_AUDIO enqueues the current message for speech", async () => {
      const state = activeStateWithBatch(makeBatchWithMessage("hello world"))
      const machine = createFakeMachine(state)
      const audioTTS = createFakeAudioTTS()
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        audioTTS,
        componentId: "c1",
        enableTTS: true,
      })

      executor.execute([{ type: "PLAY_AUDIO" }])
      await flushAsync()

      expect(audioTTS.speak).toHaveBeenCalledWith("hello world")
    })

    it("PLAY_AUDIO is a safe no-op when there is no current message", () => {
      const machine = createFakeMachine(emptyActiveState())
      const audioTTS = createFakeAudioTTS()
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        audioTTS,
        componentId: "c1",
        enableTTS: true,
      })

      expect(() => executor?.execute([{ type: "PLAY_AUDIO" }])).not.toThrow()
      expect(audioTTS.speak).not.toHaveBeenCalled()
    })

    it("PLAY_AUDIO is a safe no-op when TTS is disabled", () => {
      const state = activeStateWithBatch(makeBatchWithMessage("hello"))
      const machine = createFakeMachine(state)
      const audioTTS = createFakeAudioTTS()
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        audioTTS,
        componentId: "c1",
        enableTTS: false,
      })

      expect(() => executor?.execute([{ type: "PLAY_AUDIO" }])).not.toThrow()
      expect(audioTTS.speak).not.toHaveBeenCalled()
    })

    it("STOP_AUDIO stops the underlying audio", () => {
      const state = activeStateWithBatch(makeBatchWithMessage("hello"))
      const machine = createFakeMachine(state)
      const audioTTS = createFakeAudioTTS()
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        audioTTS,
        componentId: "c1",
        enableTTS: true,
      })

      executor.execute([{ type: "STOP_AUDIO" }])
      expect(audioTTS.stop).toHaveBeenCalled()
    })
  })

  describe("dispatch switch - notification effects", () => {
    it("NOTIFY_BATCH_COMPLETE invokes onBatchComplete with the batch index", () => {
      const onBatchComplete = vi.fn()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        onBatchComplete,
      })

      executor.execute([{ type: "NOTIFY_BATCH_COMPLETE", batchIndex: 3 }])
      expect(onBatchComplete).toHaveBeenCalledWith(3)
    })

    it("NOTIFY_SESSION_COMPLETE invokes onSessionComplete", () => {
      const onSessionComplete = vi.fn()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        onSessionComplete,
      })

      executor.execute([{ type: "NOTIFY_SESSION_COMPLETE" }])
      expect(onSessionComplete).toHaveBeenCalledTimes(1)
    })

    it("NOTIFY_SESSION_RESET destroys the executor - later effects are ignored", () => {
      vi.useFakeTimers()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        timerInterval: 1000,
      })

      executor.execute([{ type: "START_TIMER" }])
      executor.execute([{ type: "NOTIFY_SESSION_RESET" }])

      vi.mocked(machine.dispatch).mockClear()
      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(5000)

      const tickCalls = vi
        .mocked(machine.dispatch)
        .mock.calls.filter(([event]) => event.type === "TIMER_TICK")
      expect(tickCalls).toHaveLength(0)
    })
  })

  describe("error handling", () => {
    it("routes a callback throw to onError instead of crashing execute()", () => {
      const onError = vi.fn()
      const boom = new Error("callback exploded")
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        onBatchComplete: () => {
          throw boom
        },
        onError,
      })

      expect(() =>
        executor?.execute([{ type: "NOTIFY_BATCH_COMPLETE", batchIndex: 0 }])
      ).not.toThrow()
      expect(onError).toHaveBeenCalledWith(boom, {
        type: "NOTIFY_BATCH_COMPLETE",
        batchIndex: 0,
      })
    })
  })

  describe("execute() after destroy", () => {
    it("ignores effects once destroyed", () => {
      const onSessionComplete = vi.fn()
      const machine = createFakeMachine(emptyActiveState())
      executor = createEffectExecutor({
        machine,
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
        onSessionComplete,
      })

      executor.destroy()
      executor.execute([{ type: "NOTIFY_SESSION_COMPLETE" }])

      expect(onSessionComplete).not.toHaveBeenCalled()
    })
  })

  describe("public TTS-control API", () => {
    it("speakMessage delegates to the TTS handler's manual speak", async () => {
      const audioTTS = createFakeAudioTTS()
      executor = createEffectExecutor({
        machine: createFakeMachine(emptyActiveState()),
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        audioTTS,
        componentId: "c1",
        enableTTS: true,
      })

      await executor.speakMessage({
        id: "m1",
        role: "assistant",
        content: "manual line",
        timestamp: new Date(2024, 0, 1).toISOString(),
        korean: "안녕",
        english: "hello",
      })

      expect(audioTTS.speak).toHaveBeenCalledWith("manual line")
    })

    it("speakMessage warns instead of throwing when TTS is disabled", async () => {
      executor = createEffectExecutor({
        machine: createFakeMachine(emptyActiveState()),
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
      })

      await expect(
        executor.speakMessage({
          id: "m1",
          role: "assistant",
          content: "x",
          timestamp: new Date(2024, 0, 1).toISOString(),
          korean: "안녕",
          english: "hello",
        })
      ).resolves.toBeUndefined()
    })

    it("isSpeaking() reflects the underlying TTS handler state", () => {
      executor = createEffectExecutor({
        machine: createFakeMachine(emptyActiveState()),
        repository: fakeRepository,
        queryBridge: createFakeQueryBridge(),
        enableTTS: false,
      })
      expect(executor.isSpeaking()).toBe(false)
      expect(executor.getCurrentSpeakingId()).toBeNull()
    })
  })
})
