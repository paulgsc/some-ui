import type { Message } from "@chat/types/chat"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChatMessages } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

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

const chats: Array<Message> = [
  makeMessage("m0"),
  makeMessage("m1"),
  makeMessage("m2"),
]

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

// ═══════════════════════════════════════════════════════════════════════════
// index cycling - wraps to 0 past chats.length
// ═══════════════════════════════════════════════════════════════════════════

describe("useChatMessages - index cycling", () => {
  it("advances one message per tick, then wraps back to index 0 past chats.length", () => {
    const { result } = renderHook(() =>
      useChatMessages({ chats, intervalMs: 1000 })
    )

    expect(result.current.currentIndex).toBe(0)
    expect(result.current.chats).toEqual([])

    advance(1000)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.chats).toEqual([chats[0]])

    advance(1000)
    expect(result.current.currentIndex).toBe(2)
    expect(result.current.chats).toEqual([chats[0], chats[1]])

    // nextIndex (3) is not < chats.length (3) - wraps to 0, leaving the
    // previous windowed slice stale since setMessages isn't called this tick.
    advance(1000)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.chats).toEqual([chats[0], chats[1]])

    advance(1000)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.chats).toEqual([chats[0]])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// onPause / onResume - re-arming the interval
// ═══════════════════════════════════════════════════════════════════════════

describe("useChatMessages - onPause/onResume", () => {
  it("onPause stops the interval and onResume re-arms it", () => {
    const { result } = renderHook(() =>
      useChatMessages({ chats, intervalMs: 1000 })
    )

    advance(1000)
    expect(result.current.currentIndex).toBe(1)

    act(() => {
      result.current.onPause()
    })
    advance(5000)
    expect(result.current.currentIndex).toBe(1) // no ticks while paused

    act(() => {
      result.current.onResume()
    })
    advance(1000)
    expect(result.current.currentIndex).toBe(2)
  })
})
