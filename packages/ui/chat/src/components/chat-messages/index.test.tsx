import type { Message } from "@chat/types/chat"
import { act, render } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import type { TTSOptions } from "some-ui-utils"
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

// ChatMessages's child (ChatMessage) also pulls other exports (e.g.
// formatRelativeTime) from "some-ui-utils", so the real module is kept via
// importOriginal and only useSpeechQueue is swapped out.
vi.mock("some-ui-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof SomeUiUtils>()
  // The mock's useSpeechQueue only returns the 3 fields ChatMessages
  // actually reads (speak/isActive/currentItem) - the rest of the real
  // UseSpeechQueueReturn is irrelevant to what's under test here, and
  // vi.mock's factory return type isn't narrow enough for
  // typescript-eslint to see that as safe.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- see comment above
  return {
    ...actual,
    useSpeechQueue: useSpeechQueueMock,
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
//
// The chat-cycling interval (from useChatMessages) defaults to 10s and isn't
// overridable from ChatMessages's own props, so tests advance fake timers by
// that much to drive one tick at a time.
// ═══════════════════════════════════════════════════════════════════════════

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

beforeEach(() => {
  vi.useFakeTimers()
  useSpeechQueueMock.mockReturnValue({
    speak: speakMock,
    isActive: false,
    currentItem: null,
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// lastSpokenRef dedup guard
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// pause-coordination effect (isActive / currentItem from the shared queue)
// ═══════════════════════════════════════════════════════════════════════════

describe("ChatMessages - pause-coordination effect", () => {
  it("pauses its own cycling while another component owns the shared speech queue", () => {
    useSpeechQueueMock.mockReturnValue({
      speak: speakMock,
      isActive: true,
      currentItem: { componentId: "other-widget" },
    })
    const messages = [makeMessage("m0"), makeMessage("m1")]
    render(<ChatMessages messages={messages} />)

    tick()
    tick()
    expect(speakMock).not.toHaveBeenCalled()
  })

  it("resumes cycling once the shared queue frees up", () => {
    useSpeechQueueMock.mockReturnValue({
      speak: speakMock,
      isActive: true,
      currentItem: { componentId: "other-widget" },
    })
    const messages = [makeMessage("m0"), makeMessage("m1")]
    const { rerender } = render(<ChatMessages messages={messages} />)

    tick()
    expect(speakMock).not.toHaveBeenCalled()

    useSpeechQueueMock.mockReturnValue({
      speak: speakMock,
      isActive: false,
      currentItem: null,
    })
    rerender(<ChatMessages messages={messages} />)

    tick()
    expect(speakMock).toHaveBeenCalledTimes(1)
  })
})
