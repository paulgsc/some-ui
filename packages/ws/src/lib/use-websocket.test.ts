import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { FakeWebSocket, nextUrl } from "./__tests__/fake-websocket"
import { WebSocketManager } from "./manager"
import { useWebSocket } from "./use-websocket"

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
