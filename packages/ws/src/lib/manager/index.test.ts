import { FakeWebSocket, nextUrl } from "@ws/lib/__tests__/fake-websocket"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WebSocketManager } from "."

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal("WebSocket", FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("WebSocketManager - singleton per URL", () => {
  it("returns the same instance for the same URL and a different one for a different URL", () => {
    const url = nextUrl()
    const a = WebSocketManager.getInstance(url)
    const b = WebSocketManager.getInstance(url)
    const c = WebSocketManager.getInstance(nextUrl())

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe("WebSocketManager - thundering herd protection", () => {
  it("shares one connection and runs the init callback exactly once for concurrent acquire() calls", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)
    const init = vi.fn(async () => {})

    const p1 = manager.acquire(init)
    const p2 = manager.acquire()
    const p3 = manager.acquire()

    expect(FakeWebSocket.instances).toHaveLength(1)
    FakeWebSocket.instances[0]!.simulateOpen()

    await Promise.all([p1, p2, p3])

    expect(init).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(manager.referenceCount).toBe(3)

    manager.release()
    manager.release()
    manager.release()
  })
})

describe("WebSocketManager - ref-counted disposal", () => {
  // These two used to read disposal off the singleton map - "getInstance no
  // longer returns this object" stood in for "this object was disposed".
  // The map no longer forgets (see the note on `instances`), so they assert
  // disposal by its actual effects instead: the lifecycle reset and the
  // closed socket. That is the thing they were always about; the registry
  // deletion was an incidental side-effect being used as a probe.
  it("disposes once the ref count returns to zero", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p = manager.acquire()
    const socket = FakeWebSocket.instances[0]!
    socket.simulateOpen()
    await p

    expect(manager.isInitialized).toBe(true)
    manager.release()

    expect(manager.referenceCount).toBe(0)
    expect(manager.isInitialized).toBe(false)
    expect(manager.isConnected).toBe(false)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
    // ...and it is still the manager for this URL.
    expect(WebSocketManager.getInstance(url)).toBe(manager)
  })

  it("does not dispose while other callers still hold a reference", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p1 = manager.acquire()
    const p2 = manager.acquire()
    const socket = FakeWebSocket.instances[0]!
    socket.simulateOpen()
    await Promise.all([p1, p2])

    manager.release()
    expect(manager.referenceCount).toBe(1)
    expect(manager.isInitialized).toBe(true)
    expect(socket.readyState).not.toBe(FakeWebSocket.CLOSED)

    manager.release()
    expect(manager.referenceCount).toBe(0)
    expect(manager.isInitialized).toBe(false)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
  })
})

describe("WebSocketManager - init failure caching", () => {
  it("rejects a retry within the debounce window with the cached error, without opening a new socket", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p1 = manager.acquire()
    FakeWebSocket.instances[0]!.simulateError(new Error("connect failed"))
    await expect(p1).rejects.toThrow("connect failed")

    const socketCountAfterFailure = FakeWebSocket.instances.length
    await expect(manager.acquire()).rejects.toThrow("connect failed")

    expect(FakeWebSocket.instances).toHaveLength(socketCountAfterFailure)
  })

  it("attempts a fresh connection once the debounce window has elapsed", async () => {
    vi.useFakeTimers()
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p1 = manager.acquire()
    FakeWebSocket.instances[0]!.simulateError(new Error("connect failed"))
    await expect(p1).rejects.toThrow("connect failed")

    await vi.advanceTimersByTimeAsync(5001)

    const p2 = manager.acquire()
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.instances[1]!.simulateOpen()

    await expect(p2).resolves.toBeUndefined()
  })
})

describe("WebSocketManager - reconnect gives up after maxReconnectAttempts", () => {
  it("stops scheduling reconnects once the attempt limit is reached and reports it in the snapshot", async () => {
    vi.useFakeTimers()
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url, {
      autoReconnect: true,
      reconnectInterval: 100,
      maxReconnectAttempts: 2,
    })

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    // Real disconnect - schedules reconnect attempt 1.
    FakeWebSocket.instances[0]!.simulateClose()
    expect(manager.getSnapshot().reconnectAttempts).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.instances[1]!.simulateClose() // attempt 1 also fails to open
    expect(manager.getSnapshot().reconnectAttempts).toBe(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeWebSocket.instances).toHaveLength(3)
    FakeWebSocket.instances[2]!.simulateClose() // attempt 2 fails -> limit reached

    expect(manager.getSnapshot().reconnectAttempts).toBe(2)
    expect(manager.getSnapshot().error).toBe("Reconnect limit reached")

    // No further reconnect attempt gets scheduled beyond the limit.
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances).toHaveLength(3)
  })
})

describe("WebSocketManager - message handling", () => {
  it("regression: a successfully parsed message updates the snapshot's lastMessage", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    FakeWebSocket.instances[0]!.simulateMessage({ hello: "world" })

    expect(manager.getSnapshot().lastMessage).toEqual({ hello: "world" })
  })

  it("notifies message listeners with the parsed payload", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)
    const onMessage = vi.fn()
    manager.addMessageListener(onMessage)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    FakeWebSocket.instances[0]!.simulateMessage({ n: 1 })
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ n: 1 })
  })

  it("tracks parseErrorCount and notifies error listeners on malformed JSON, without touching lastMessage", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)
    const onError = vi.fn()
    manager.addErrorListener(onError)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    FakeWebSocket.instances[0]!.simulateMalformedMessage("not json{")

    expect(manager.getSnapshot().parseErrorCount).toBe(1)
    expect(manager.getSnapshot().lastMessage).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
  })

  it("an unsubscribed listener stops receiving messages", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)
    const onMessage = vi.fn()
    const unsubscribe = manager.addMessageListener(onMessage)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    unsubscribe()
    FakeWebSocket.instances[0]!.simulateMessage({ n: 1 })

    expect(onMessage).not.toHaveBeenCalled()
  })
})

describe("WebSocketManager - sendMessage", () => {
  it("throws when the socket is not open", () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)
    void manager.acquire() // deliberately not awaited/opened - socket stays CONNECTING

    expect(() => manager.sendMessage({ ping: true })).toThrow(
      "WebSocket is not connected"
    )
  })

  it("serializes and sends the message once the socket is open", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    manager.sendMessage({ ping: true })

    expect(FakeWebSocket.instances[0]!.sent).toEqual([
      JSON.stringify({ ping: true }),
    ])
  })
})

describe("WebSocketManager - the registry outlives the connection", () => {
  /** `acquire()` only settles once the socket opens, and these cases are
   * about the reference count rather than the connection - `refCounter`
   * increments synchronously, so a microtask is all they need. */
  const acquireWithoutConnecting = async (
    manager: WebSocketManager
  ): Promise<void> => {
    void manager.acquire()
    await Promise.resolve()
  }

  it("keeps a manager registered after its last reference goes", async () => {
    // Disposal ends the connection, not the identity. This is what makes
    // `getInstance` total: it can never hand back an object that is not the
    // registered one for its URL, whatever any consumer is doing.
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    await acquireWithoutConnecting(manager)
    manager.release()

    expect(WebSocketManager.getInstance(url)).toBe(manager)
  })

  it("hands the same manager back to a later consumer, which reconnects it", async () => {
    // The <StrictMode> shape, and any remount: the whole app releases a URL
    // and something picks it up again later. It must get the same object,
    // and that object must still work - disposal resets the lifecycle to
    // idle rather than making it terminal.
    const url = nextUrl()
    const first = WebSocketManager.getInstance(url)

    await acquireWithoutConnecting(first)
    first.release()

    const second = WebSocketManager.getInstance(url)
    expect(second).toBe(first)

    await acquireWithoutConnecting(second)
    expect(FakeWebSocket.instances.at(-1)?.url).toBe(url)
    expect(WebSocketManager.getInstance(url)).toBe(first)
  })

  it("never lets two managers exist for one url", async () => {
    // The failure the old delete-on-zero made reachable: a second manager on
    // a second socket for the same URL, after which either one's disposal
    // could evict the other's entry. With the registry write-once the
    // scenario has no construction - every getInstance across a full
    // acquire/release/re-acquire cycle is the same object, so there is only
    // ever one socket owner per URL.
    const url = nextUrl()
    const seen = new Set<WebSocketManager>()

    for (let i = 0; i < 3; i += 1) {
      const manager = WebSocketManager.getInstance(url)
      seen.add(manager)
      await acquireWithoutConnecting(manager)
      seen.add(WebSocketManager.getInstance(url))
      manager.release()
      seen.add(WebSocketManager.getInstance(url))
    }

    expect(seen.size).toBe(1)
  })
})
