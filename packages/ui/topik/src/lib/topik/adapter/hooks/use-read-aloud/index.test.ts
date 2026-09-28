import type { SpeechAdapter } from "@some-ui/speech"
import { act, renderHook } from "@testing-library/react"
import type {
  ReadAloudRecordEvent,
  UseReadAloudOptions,
} from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import { useReadAloud } from "@topik/lib/topik/adapter/hooks/use-read-aloud"
import type { SetProgress } from "@topik/lib/topik/read-aloud/set-machine"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"
import { echoMs } from "@topik/lib/topik/read-aloud/timing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** How long the fake voice takes to say anything. */
const SPOKEN_MS = 1000

type FakeSpeech = SpeechAdapter & { said: Array<string>; stops: number }

function fakeSpeech(): FakeSpeech {
  const speech: FakeSpeech = {
    id: "web-speech",
    supported: true,
    voices: [],
    pending: 0,
    said: [],
    stops: 0,
    speak: (text, options): Promise<void> => {
      speech.said.push(text)
      options?.onStart?.()
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, SPOKEN_MS)
        options?.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    },
    stop: () => {
      speech.stops += 1
    },
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: () => undefined,
  }
  return speech
}

type Harness = {
  speech: FakeSpeech
  records: Array<ReadAloudRecordEvent>
  paces: Array<string>
  progress: Array<SetProgress | null>
  options: UseReadAloudOptions
}

function harness(overrides: Partial<UseReadAloudOptions> = {}): Harness {
  const records: Array<ReadAloudRecordEvent> = []
  const paces: Array<string> = []
  const progress: Array<SetProgress | null> = []
  const speech = fakeSpeech()
  return {
    speech,
    records,
    paces,
    progress,
    options: {
      deck: STARTER_DECK,
      level: 1,
      speech,
      seedKey: () => "fixed",
      onRecord: (event) => records.push(event),
      onPace: (wordId) => paces.push(wordId),
      onProgress: (left) => progress.push(left),
      ...overrides,
    },
  }
}

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const setVisibility = (state: "hidden" | "visible"): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  setVisibility("visible")
  vi.useRealTimers()
})

describe("useReadAloud", () => {
  it("starts nothing before the learner's first tap", async () => {
    const { options, speech } = harness()
    const { result } = renderHook(() => useReadAloud(options))
    await advance(60_000)
    expect(result.current.started).toBe(false)
    expect(result.current.state.phase.name).toBe("idle")
    expect(speech.said).toEqual([])
  })

  it("draws a set on begin and runs it to its summary", async () => {
    const { options, records, progress } = harness()
    const { result } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    expect(result.current.state.phase.name).toBe("glyphs")
    expect(progress.at(-1)?.queue).toHaveLength(10)
    for (let tick = 0; tick < 400; tick += 1) {
      if (result.current.state.phase.name === "summary") break
      await advance(500)
    }
    expect(result.current.state.phase.name).toBe("summary")
    expect(records.filter((event) => event.type === "rep")).toHaveLength(10)
    expect(records.filter((event) => event.type === "set")).toHaveLength(1)
    expect(progress.at(-1)).toBeNull()
  })

  it("speaks the item and sets the echo from what was heard", async () => {
    const { options, speech } = harness()
    const { result } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    const item = result.current.entry?.item
    while (result.current.state.phase.name !== "audio") await advance(50)
    expect(speech.said).toEqual([item?.text])
    await advance(SPOKEN_MS)
    expect(result.current.state.phase.name).toBe("echo")
    expect(result.current.step?.ms).toBe(
      echoMs(SPOKEN_MS, item?.kind ?? "word")
    )
  })

  it("starts a rep over when the page is hidden and shown", async () => {
    const { options, speech, records } = harness()
    const { result } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    while (result.current.state.phase.name !== "audio") await advance(50)
    act(() => setVisibility("hidden"))
    expect(result.current.state.phase).toMatchObject({
      name: "paused",
      by: "hidden",
    })
    expect(speech.stops).toBeGreaterThan(0)
    await advance(10 * 60_000)
    act(() => setVisibility("visible"))
    expect(result.current.state.phase.name).toBe("glyphs")
    expect(result.current.state.cursor).toBe(0)
    expect(records).toEqual([])
  })

  it("resumes an unfinished set at its next rep", () => {
    const first = harness()
    const { result: before } = renderHook(() => useReadAloud(first.options))
    act(() => before.current.begin())
    const left = first.progress.at(-1)
    const resume = left ? { ...left, queue: left.queue.slice(3) } : null
    const { options } = harness({ resume })
    const { result } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    expect(result.current.entry).toEqual(resume?.queue[0])
    expect(result.current.state.queue).toHaveLength(7)
  })

  it("marks the audio as playing only once the voice starts", async () => {
    const { options, speech } = harness()
    let begin: (() => void) | undefined
    const slow: typeof speech = {
      ...speech,
      speak: (text, speakOptions): Promise<void> =>
        new Promise<void>((resolve) => {
          // A server voice: synthesis first, then playback.
          begin = (): void => {
            speakOptions?.onStart?.()
            setTimeout(resolve, SPOKEN_MS)
          }
          void text
        }),
    }
    const { result } = renderHook(() =>
      useReadAloud({ ...options, speech: slow })
    )
    act(() => result.current.begin())
    while (result.current.state.phase.name !== "audio") await advance(50)
    expect(result.current.playing).toBeNull()
    act(() => begin?.())
    expect(result.current.playing).toBe(result.current.state.seq)
  })

  it("says so when the deck has nothing at or below the level", () => {
    const { options } = harness({
      deck: {
        ...STARTER_DECK,
        lines: STARTER_DECK.lines.filter((line) => line.level === 3),
      },
    })
    const { result } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    expect(result.current.empty).toBe(true)
    expect(result.current.state.phase.name).toBe("idle")
  })

  it("says whether audio is available", () => {
    const { options } = harness({ speech: null })
    const { result } = renderHook(() => useReadAloud(options))
    expect(result.current.audio).toBe(false)
  })

  it("stops its timers and speech when unmounted", async () => {
    const { options, speech } = harness()
    const { result, unmount } = renderHook(() => useReadAloud(options))
    act(() => result.current.begin())
    while (result.current.state.phase.name !== "audio") await advance(50)
    unmount()
    const said = speech.said.length
    await advance(10 * 60_000)
    expect(speech.said).toHaveLength(said)
    expect(vi.getTimerCount()).toBe(0)
  })
})
