import { act, renderHook, waitFor } from "@testing-library/react"
import { FakeWebSocket, nextUrl } from "@ws/lib/__tests__/fake-websocket"
import { WebSocketManager } from "@ws/lib/manager"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { useWebSocket } from "."

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal("WebSocket", FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const incomingSchema = z.object({ type: z.literal("known") })

describe("useWebSocket - incoming schema validation", () => {
  it("calls onError and not onIncomingMessage when the message fails schema validation", async () => {
    const onIncomingMessage = vi.fn()
    const onError = vi.fn()
    const url = nextUrl()

    renderHook(() =>
      useWebSocket({
        url,
        incomingMessageSchema: incomingSchema,
        onIncomingMessage,
        onError,
      })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    await act(async () => {
      FakeWebSocket.instances[0]!.simulateOpen()
      await Promise.resolve()
    })

    act(() => {
      FakeWebSocket.instances[0]!.simulateMessage({ type: "unexpected" })
    })

    expect(onIncomingMessage).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error("Incoming message schema mismatch")
    )
  })

  it("calls onIncomingMessage with the parsed payload for a valid message", async () => {
    const onIncomingMessage = vi.fn()
    const url = nextUrl()

    renderHook(() =>
      useWebSocket({
        url,
        incomingMessageSchema: incomingSchema,
        onIncomingMessage,
      })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    await act(async () => {
      FakeWebSocket.instances[0]!.simulateOpen()
      await Promise.resolve()
    })

    act(() => {
      FakeWebSocket.instances[0]!.simulateMessage({ type: "known" })
    })

    expect(onIncomingMessage).toHaveBeenCalledExactlyOnceWith({
      type: "known",
    })
  })
})

describe("useWebSocket - outgoing schema validation", () => {
  const outgoingSchema = z.object({ text: z.string().min(1) })

  it("does not send a payload that fails outgoing validation", async () => {
    const url = nextUrl()
    const { result } = renderHook(() =>
      useWebSocket({
        url,
        incomingMessageSchema: incomingSchema,
        outgoingMessageSchema: outgoingSchema,
      })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    await act(async () => {
      FakeWebSocket.instances[0]!.simulateOpen()
      await Promise.resolve()
    })

    act(() => {
      result.current.sendMessage({ text: "" })
    })

    expect(FakeWebSocket.instances[0]!.sent).toEqual([])
  })

  it("sends a validated payload once connected", async () => {
    const url = nextUrl()
    const { result } = renderHook(() =>
      useWebSocket({
        url,
        incomingMessageSchema: incomingSchema,
        outgoingMessageSchema: outgoingSchema,
      })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    await act(async () => {
      FakeWebSocket.instances[0]!.simulateOpen()
      await Promise.resolve()
    })

    act(() => {
      result.current.sendMessage({ text: "hi" })
    })

    expect(FakeWebSocket.instances[0]!.sent).toEqual([
      JSON.stringify({ text: "hi" }),
    ])
  })
})

describe("useWebSocket - unmount before acquire() resolves", () => {
  it("does not throw and does not release a reference it never finished acquiring", async () => {
    const releaseSpy = vi.spyOn(WebSocketManager.prototype, "release")
    const url = nextUrl()

    const { unmount } = renderHook(() =>
      useWebSocket({ url, incomingMessageSchema: incomingSchema })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    // Deliberately never call simulateOpen() - acquire() is left pending,
    // matching a component that unmounts mid-connect.

    expect(() => unmount()).not.toThrow()
    expect(releaseSpy).not.toHaveBeenCalled()
  })
})

describe("useWebSocket - no url", () => {
  it("opens no socket at all", () => {
    // The failure this guards is silent and expensive rather than loud: a
    // syntactically fine URL pointing at nothing (a WebView's own
    // `localhost`, a dead LAN box) gets dialed, fails, and is retried on a
    // timer for as long as the surface stays mounted.
    renderHook(() =>
      useWebSocket({
        url: undefined,
        incomingMessageSchema: incomingSchema,
      })
    )

    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it("reports a calm disconnected snapshot rather than an error", () => {
    // "Not configured" is a steady state, not a fault: a surface renders its
    // offline form off `isConnected`, and an `error` here would push it
    // toward an alarm about a connection nobody asked for.
    const { result } = renderHook(() =>
      useWebSocket({
        url: undefined,
        incomingMessageSchema: incomingSchema,
      })
    )

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isInitializing).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastMessage).toBeNull()
    expect(result.current.manager).toBeNull()
  })

  it("keeps a stable snapshot identity across re-renders", () => {
    // useSyncExternalStore compares getSnapshot's result by identity. A
    // fresh object literal per call reads as "the store changed" every time
    // and spins the render loop - the reason DISCONNECTED_SNAPSHOT is a
    // module-level constant. Re-rendering is how that regression surfaces:
    // an unstable snapshot throws "getSnapshot should be cached".
    const { result, rerender } = renderHook(() =>
      useWebSocket({
        url: undefined,
        incomingMessageSchema: incomingSchema,
      })
    )

    const first = result.current.lastMessage
    rerender()
    rerender()

    expect(result.current.lastMessage).toBe(first)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it("does not throw when a caller sends into the void", async () => {
    // sendMessage is fire-and-forget everywhere else, so it stays so here;
    // sendSerialized already rejects on a disconnected manager and keeps
    // that contract rather than growing a second "not configured" shape.
    const { result } = renderHook(() =>
      useWebSocket<{ type: "known" }, { type: string }>({
        url: undefined,
        incomingMessageSchema: incomingSchema,
      })
    )

    expect(() => {
      result.current.sendMessage({ type: "anything" })
    }).not.toThrow()

    await expect(
      result.current.sendSerialized({ type: "anything" })
    ).rejects.toThrow(/not connected/i)
  })
})
