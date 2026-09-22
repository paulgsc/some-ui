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
  it("releases the reference it took, without throwing", async () => {
    // This used to assert the opposite - that `release` was *not* called -
    // on the reasoning that a pending `acquire()` had not taken a reference
    // yet. It had: `manager.acquire` runs `refCounter.acquire()` as its
    // first statement and only then awaits initialization, so the reference
    // exists from the call, not from the resolution.
    //
    // Skipping the release therefore stranded the manager at a count that
    // could never reach zero: `onZero` never fired, `dispose()` never ran,
    // and the socket stayed open with its reconnect timer for the life of
    // the page. Releasing it does not throw, which was the other half of
    // the old assertion's worry - `ReferenceCounter.release` only throws
    // below zero, and this release is exactly paired with its acquire.
    const releaseSpy = vi.spyOn(WebSocketManager.prototype, "release")
    const url = nextUrl()

    const { unmount } = renderHook(() =>
      useWebSocket({ url, incomingMessageSchema: incomingSchema })
    )

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    // Deliberately never call simulateOpen() - acquire() is left pending,
    // matching a component that unmounts mid-connect.
    const socket = FakeWebSocket.instances[0]!

    expect(() => unmount()).not.toThrow()

    expect(releaseSpy).toHaveBeenCalledTimes(1)
    // The observable point of releasing: the manager disposed, so the socket
    // is closed and the next caller gets a fresh instance rather than this
    // stranded one.
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
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

/** The hook's own `url` type, named so the `renderHook` props below are
 * typed by declaration rather than by asserting a literal into shape. */
type UrlProps = { u: string | undefined }

function initialUrlProps(u: string | undefined): UrlProps {
  return { u }
}

describe("useWebSocket - url changing after mount", () => {
  it("connects when a url arrives on a hook that mounted without one", async () => {
    // `useOrchestrator`'s `orchestratorUrl` is an optional prop that may be
    // resolved asynchronously, so undefined-then-a-url is a real sequence
    // rather than a hypothetical. A manager pinned by a `useState`
    // initializer leaves such a hook disconnected for good.
    const url = nextUrl()
    const { result, rerender } = renderHook(
      ({ u }: UrlProps) =>
        useWebSocket({ url: u, incomingMessageSchema: incomingSchema }),
      { initialProps: initialUrlProps(undefined) }
    )

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(result.current.manager).toBeNull()

    rerender({ u: url })

    await waitFor(() => {
      expect(result.current.manager).not.toBeNull()
    })
    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
  })

  it("releases the socket when the url goes away", async () => {
    // The inverse: keeping the old socket alive would defeat the opt-out
    // the `undefined` url exists to provide.
    const url = nextUrl()
    const { result, rerender } = renderHook(
      ({ u }: UrlProps) =>
        useWebSocket({ url: u, incomingMessageSchema: incomingSchema }),
      { initialProps: initialUrlProps(url) }
    )

    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1)
    })
    const acquired = result.current.manager
    if (!acquired) throw new Error("expected a manager while the url was set")
    const releaseSpy = vi.spyOn(acquired, "release")

    rerender({ u: undefined })

    expect(releaseSpy).toHaveBeenCalled()
    expect(result.current.manager).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it("keeps one manager across re-renders that do not change the url", async () => {
    // The memo must not churn: WebSocketManager is a per-URL singleton, so a
    // recompute for an unchanged url has to hand back the same identity or
    // the acquire/release effect thrashes the socket on every render.
    const url = nextUrl()
    const { result, rerender } = renderHook(
      ({ u }: UrlProps) =>
        useWebSocket({ url: u, incomingMessageSchema: incomingSchema }),
      { initialProps: initialUrlProps(url) }
    )

    await waitFor(() => {
      expect(result.current.manager).not.toBeNull()
    })
    const first = result.current.manager

    rerender({ u: url })
    rerender({ u: url })

    expect(result.current.manager).toBe(first)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
