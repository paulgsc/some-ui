import type { Message } from "@chat/types/chat"
import type * as SomeUiSpeech from "@some-ui/speech"
import type { TTSOptions } from "@some-ui/speech"
import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChatMessages } from "."

type Speak = (
  text: string,
  options?: TTSOptions,
  priority?: number,
  maxRetries?: number
) => void

type QueueItem = { componentId?: string } | null

const { speakMock, useSpeechQueueMock } = vi.hoisted(() => {
  const speakMock = vi.fn<Speak>()
  const useSpeechQueueMock = vi.fn(
    (): { speak: Speak; isActive: boolean; currentItem: QueueItem } => ({
      speak: speakMock,
      isActive: false,
      currentItem: null,
    })
  )
  return { speakMock, useSpeechQueueMock }
})

// Only `useSpeechQueue` is swapped out (it throws without a live session on
// purpose), returning just the fields ChatMessages reads, so this tests
// ChatMessages rather than the speech session.
vi.mock("@some-ui/speech", async (importOriginal) => {
  const actual = await importOriginal<typeof SomeUiSpeech>()
  return {
    ...actual,
    useSpeechQueue: useSpeechQueueMock,
  }
})

// useChatMessages' cycling interval; ChatMessages cannot override it.
const TICK_MS = 10_000

function makeMessage(id: string): Message {
  return {
    id,
    character: "ai",
    position: "left",
    content: `content-${id}`,
    type: "chat",
    timestamp: new Date(2024, 0, 1).toISOString(),
    avatar: { src: "avatar.png", alt: "avatar" },
  }
}

function tick(ms = TICK_MS): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function lastSpeakOptions(): TTSOptions {
  const call = speakMock.mock.calls.at(-1)
  if (!call) throw new Error("speak() was never called")
  const options = call[1]
  if (!options) throw new Error("speak() was called without options")
  return options
}

/** The shared queue: free, or busy speaking for another component. */
function queue(busy: boolean): void {
  useSpeechQueueMock.mockReturnValue({
    speak: speakMock,
    isActive: busy,
    currentItem: busy ? { componentId: "other-widget" } : null,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  queue(false)
})

describe("ChatMessages - speak dedup guard", () => {
  it("does not re-speak the same index/content pair when onEnd toggles isSpeaking back off", () => {
    const messages = [makeMessage("m0"), makeMessage("m1")]
    render(<ChatMessages messages={messages} />)

    tick() // first cycle tick: currentIndex 0 -> 1, chats = [m0]
    expect(speakMock).toHaveBeenCalledTimes(1)
    expect(speakMock).toHaveBeenCalledWith("content-m0", expect.anything(), 1)

    const { onStart, onEnd } = lastSpeakOptions()

    // Speech starts: isSpeaking flips true. The effect re-runs (isSpeaking is
    // a dependency) but bails immediately since isSpeaking is now true.
    act(() => {
      onStart?.()
    })
    expect(speakMock).toHaveBeenCalledTimes(1)

    // Speech ends: isSpeaking flips back to false, re-running the effect
    // with the exact same {index: 0, content: "content-m0"} pair - the
    // dedup guard must skip it rather than re-triggering speak().
    act(() => {
      onEnd?.()
    })
    expect(speakMock).toHaveBeenCalledTimes(1)
  })

  it("speaks the next message once currentIndex actually advances", () => {
    const messages = [makeMessage("m0"), makeMessage("m1"), makeMessage("m2")]
    render(<ChatMessages messages={messages} />)

    tick()
    expect(speakMock).toHaveBeenCalledTimes(1)
    const { onEnd } = lastSpeakOptions()
    act(() => {
      onEnd?.()
    })
    expect(speakMock).toHaveBeenCalledTimes(1)

    tick() // second cycle tick: currentIndex 1 -> 2, chats = [m0, m1]
    expect(speakMock).toHaveBeenCalledTimes(2)
    expect(speakMock).toHaveBeenLastCalledWith(
      "content-m1",
      expect.anything(),
      2
    )
  })
})

describe("ChatMessages - pause-coordination effect", () => {
  it("pauses its own cycling while another component owns the shared speech queue", () => {
    queue(true)
    const messages = [makeMessage("m0"), makeMessage("m1")]
    render(<ChatMessages messages={messages} />)

    tick()
    tick()
    expect(speakMock).not.toHaveBeenCalled()
  })

  it("resumes cycling once the shared queue frees up", () => {
    queue(true)
    const messages = [makeMessage("m0"), makeMessage("m1")]
    const { rerender } = render(<ChatMessages messages={messages} />)

    tick()
    expect(speakMock).not.toHaveBeenCalled()

    queue(false)
    rerender(<ChatMessages messages={messages} />)

    tick()
    expect(speakMock).toHaveBeenCalledTimes(1)
  })
})
