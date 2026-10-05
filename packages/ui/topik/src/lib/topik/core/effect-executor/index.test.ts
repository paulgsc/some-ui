import type { SayOptions, Speaker, SpeechOutcome } from "@some-ui/speech"
import type {
  ConversationBatch,
  ITopikRepository,
  Message,
  TopikMetadata,
} from "@topik/lib/topik"
import type {
  IQueryBridge,
  ISessionMachine,
  SessionState,
} from "@topik/lib/topik/core/session-types"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createEffectExecutor,
  type EffectExecutor,
  type EffectExecutorConfig,
} from "."

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

function makeMessage(content: string, id = "m0"): Message {
  return {
    id,
    role: "assistant",
    content,
    timestamp: new Date(2024, 0, 1).toISOString(),
    korean: "안녕",
    english: "hello",
  }
}

function makeBatchWithMessage(content: string): ConversationBatch {
  return { id: 0, messages: [makeMessage(content)], questions: [] }
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

/** A speaker whose lines start at once and end with `outcome`. */
function createFakeSpeaker(
  outcome: Promise<SpeechOutcome> = Promise.resolve({ kind: "heard" })
): Speaker {
  return {
    available: true,
    say: vi.fn((_content: string, options: SayOptions) => {
      options.onStart?.()
      return outcome
    }),
    stop: vi.fn(),
    muted: false,
    subscribe: () => () => undefined,
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
  }
}

const flushAsync = (): Promise<SpeechOutcome> =>
  new Promise((resolve) => setTimeout(() => resolve({ kind: "heard" }), 0))

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

const ticks = (machine: ISessionMachine): number =>
  vi
    .mocked(machine.dispatch)
    .mock.calls.filter(([e]) => e.type === "TIMER_TICK").length

describe("EffectExecutor", () => {
  let executor: EffectExecutor | undefined

  afterEach(() => {
    executor?.destroy()
    executor = undefined
    vi.useRealTimers()
  })

  /** An executor over a stub machine; TTS off unless `config` says. */
  const start = (
    state: SessionState = emptyActiveState(),
    config: Partial<EffectExecutorConfig> = {}
  ): { machine: ISessionMachine; executor: EffectExecutor } => {
    const machine = createFakeMachine(state)
    executor = createEffectExecutor({
      machine,
      repository: fakeRepository,
      queryBridge: createFakeQueryBridge(),
      enableTTS: false,
      timerInterval: 1000,
      ...config,
    })
    return { machine, executor }
  }

  /** As `start`, with a voice. */
  const voiced = (
    state: SessionState,
    speaker: Speaker,
    config: Partial<EffectExecutorConfig> = {}
  ): { machine: ISessionMachine; executor: EffectExecutor } =>
    start(state, { speaker, componentId: "c1", enableTTS: true, ...config })

  describe("dispatch switch - query effects", () => {
    it("TRIGGER_CATALOG_QUERY dispatches loading then success on resolve", async () => {
      const topiks = [makeTopikMetadata("t1")]
      const { machine, executor } = start(emptyActiveState(), {
        queryBridge: createFakeQueryBridge({
          fetchCatalog: vi.fn().mockResolvedValue({ version: "1", topiks }),
        }),
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
      const { machine, executor } = start(emptyActiveState(), {
        queryBridge: createFakeQueryBridge({
          fetchCatalog: vi.fn().mockRejectedValue(new Error("network down")),
        }),
      })

      executor.execute([{ type: "TRIGGER_CATALOG_QUERY" }])
      await flushAsync()

      expect(machine.dispatch).toHaveBeenCalledWith({
        type: "CATALOG_FAILURE",
        error: "network down",
      })
    })

    it("TRIGGER_TOPIK_QUERY dispatches started then success on resolve", async () => {
      const batches = [makeBatchWithMessage("hello")]
      const { machine, executor } = start(emptyActiveState(), {
        queryBridge: createFakeQueryBridge({
          fetchTopik: vi.fn().mockResolvedValue(batches),
        }),
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
      const { machine, executor } = start(emptyActiveState(), {
        queryBridge: createFakeQueryBridge({
          fetchTopik: vi.fn().mockRejectedValue(new Error("404")),
        }),
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
      const { machine, executor } = start()

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(3000)

      expect(ticks(machine)).toBe(3)
    })

    it("a second START_TIMER is a no-op while a timer is already running", () => {
      vi.useFakeTimers()
      const { machine, executor } = start()

      executor.execute([{ type: "START_TIMER" }])
      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(1000)

      expect(ticks(machine)).toBe(1) // 2 would mean a second interval
    })

    it("STOP_TIMER stops ticking and allows a later START_TIMER to restart it", () => {
      vi.useFakeTimers()
      const { machine, executor } = start()

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(1000)
      executor.execute([{ type: "STOP_TIMER" }])
      vi.advanceTimersByTime(5000)

      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(1000)

      expect(ticks(machine)).toBe(2)
    })
  })

  describe("dispatch switch - TTS effects", () => {
    it("PLAY_AUDIO enqueues the current message for speech", async () => {
      const speaker = createFakeSpeaker()
      const { executor } = voiced(
        activeStateWithBatch(makeBatchWithMessage("hello world")),
        speaker
      )

      executor.execute([{ type: "PLAY_AUDIO" }])
      await flushAsync()

      // The line's own options: its language and start callback, never a voice.
      expect(speaker.say).toHaveBeenCalledWith(
        "hello world",
        expect.objectContaining({
          language: "korean",
          onStart: expect.any(Function),
        })
      )
    })

    it("reports a line muted mid-speech as stopped, without advancing the lesson", async () => {
      const speaker: Speaker = {
        ...createFakeSpeaker(Promise.resolve({ kind: "muted" })),
        muted: true,
      }
      const onSpeechStopped = vi.fn()
      const onSpeechEnd = vi.fn()
      const { machine, executor } = voiced(
        activeStateWithBatch(makeBatchWithMessage("hello world")),
        speaker,
        { onSpeechStopped, onSpeechEnd }
      )

      executor.execute([{ type: "PLAY_AUDIO" }])
      await flushAsync()

      expect(onSpeechStopped).toHaveBeenCalledTimes(1)
      expect(onSpeechEnd).not.toHaveBeenCalled()
      expect(machine.dispatch).not.toHaveBeenCalled()
    })

    it.each([
      ["there is no current message", emptyActiveState, true],
      [
        "TTS is disabled",
        (): SessionState => activeStateWithBatch(makeBatchWithMessage("hello")),
        false,
      ],
    ])("PLAY_AUDIO is a safe no-op when %s", (_, state, enableTTS) => {
      const speaker = createFakeSpeaker()
      const { executor } = voiced(state(), speaker, { enableTTS })

      expect(() => executor.execute([{ type: "PLAY_AUDIO" }])).not.toThrow()
      expect(speaker.say).not.toHaveBeenCalled()
    })

    it("STOP_AUDIO stops the line playing", async () => {
      // A line that is still playing when the stop comes.
      const speaker = createFakeSpeaker(new Promise(() => undefined))
      const { executor } = voiced(
        activeStateWithBatch(makeBatchWithMessage("hello")),
        speaker
      )

      executor.execute([{ type: "PLAY_AUDIO" }])
      await flushAsync()
      executor.execute([{ type: "STOP_AUDIO" }])
      expect(speaker.stop).toHaveBeenCalled()
    })
  })

  describe("dispatch switch - notification effects", () => {
    it("NOTIFY_BATCH_COMPLETE invokes onBatchComplete with the batch index", () => {
      const onBatchComplete = vi.fn()
      const { executor } = start(emptyActiveState(), { onBatchComplete })

      executor.execute([{ type: "NOTIFY_BATCH_COMPLETE", batchIndex: 3 }])
      expect(onBatchComplete).toHaveBeenCalledWith(3)
    })

    it("NOTIFY_SESSION_COMPLETE invokes onSessionComplete", () => {
      const onSessionComplete = vi.fn()
      const { executor } = start(emptyActiveState(), { onSessionComplete })

      executor.execute([{ type: "NOTIFY_SESSION_COMPLETE" }])
      expect(onSessionComplete).toHaveBeenCalledTimes(1)
    })

    it("NOTIFY_SESSION_RESET destroys the executor - later effects are ignored", () => {
      vi.useFakeTimers()
      const { machine, executor } = start()

      executor.execute([{ type: "START_TIMER" }])
      executor.execute([{ type: "NOTIFY_SESSION_RESET" }])

      vi.mocked(machine.dispatch).mockClear()
      executor.execute([{ type: "START_TIMER" }])
      vi.advanceTimersByTime(5000)

      expect(ticks(machine)).toBe(0)
    })
  })

  describe("error handling", () => {
    it("routes a callback throw to onError instead of crashing execute()", () => {
      const onError = vi.fn()
      const boom = new Error("callback exploded")
      const { executor } = start(emptyActiveState(), {
        onBatchComplete: () => {
          throw boom
        },
        onError,
      })

      expect(() =>
        executor.execute([{ type: "NOTIFY_BATCH_COMPLETE", batchIndex: 0 }])
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
      const { executor } = start(emptyActiveState(), { onSessionComplete })

      executor.destroy()
      executor.execute([{ type: "NOTIFY_SESSION_COMPLETE" }])

      expect(onSessionComplete).not.toHaveBeenCalled()
    })
  })

  describe("public TTS-control API", () => {
    it("speakMessage delegates to the TTS handler's manual speak", async () => {
      const speaker = createFakeSpeaker()
      const { executor } = voiced(emptyActiveState(), speaker)

      await executor.speakMessage(makeMessage("manual line", "m1"))

      expect(speaker.say).toHaveBeenCalledWith(
        "manual line",
        expect.objectContaining({ language: "korean" })
      )
    })

    it("speakMessage warns instead of throwing when TTS is disabled", async () => {
      const { executor } = start()

      await expect(
        executor.speakMessage(makeMessage("x", "m1"))
      ).resolves.toBeUndefined()
    })

    it("isSpeaking() reflects the underlying TTS handler state", () => {
      const { executor } = start()
      expect(executor.isSpeaking()).toBe(false)
      expect(executor.getCurrentSpeakingId()).toBeNull()
    })
  })
})
