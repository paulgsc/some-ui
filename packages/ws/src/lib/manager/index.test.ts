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
  it("disposes and drops out of the singleton map once the ref count returns to zero", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await p

    expect(manager.isInitialized).toBe(true)
    manager.release()

    expect(manager.referenceCount).toBe(0)
    expect(WebSocketManager.getInstance(url)).not.toBe(manager)
  })

  it("does not dispose while other callers still hold a reference", async () => {
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    const p1 = manager.acquire()
    const p2 = manager.acquire()
    FakeWebSocket.instances[0]!.simulateOpen()
    await Promise.all([p1, p2])

    manager.release()
    expect(WebSocketManager.getInstance(url)).toBe(manager)

    manager.release()
    expect(WebSocketManager.getInstance(url)).not.toBe(manager)
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

describe("WebSocketManager - registration across dispose and re-acquire", () => {
  /** `acquire()` only settles once the socket opens, and these cases are
   * about the reference count rather than the connection - `refCounter`
   * increments synchronously, so a microtask is all they need. */
  const acquireWithoutConnecting = async (
    manager: WebSocketManager
  ): Promise<void> => {
    void manager.acquire()
    await Promise.resolve()
  }

  it("re-registers itself when a captured instance is acquired again", async () => {
    // The <StrictMode> shape: the last reference goes, we dispose and
    // unregister, and the same captured object is immediately re-acquired.
    // It has to reclaim the URL, or the next caller silently gets a second
    // manager on a second socket.
    //
    // Deliberately no `getInstance` between the release and the re-acquire:
    // that call would itself register a replacement and hide the point.
    const url = nextUrl()
    const first = WebSocketManager.getInstance(url)

    await acquireWithoutConnecting(first)
    first.release()

    await acquireWithoutConnecting(first)

    expect(WebSocketManager.getInstance(url)).toBe(first)
  })

  it("does not evict a live entry that is not its own", async () => {
    // Once a replacement owns the URL, the old manager's own disposal must
    // not delete it by key. Deleting blind would leave the replacement live
    // but unregistered - the same singleton break, one step removed.
    const url = nextUrl()
    const stale = WebSocketManager.getInstance(url)

    await acquireWithoutConnecting(stale)
    stale.release()

    const replacement = WebSocketManager.getInstance(url)
    expect(replacement).not.toBe(stale)

    // The stale manager runs a full acquire/release cycle. It must not
    // reclaim the URL on the way up (the slot is taken) nor evict the
    // replacement on the way down.
    await acquireWithoutConnecting(stale)
    expect(WebSocketManager.getInstance(url)).toBe(replacement)

    stale.release()

    expect(WebSocketManager.getInstance(url)).toBe(replacement)
  })
})

describe("WebSocketManager - initialization generations", () => {
  it("ignores a stale socket's failure after the manager was re-acquired", async () => {
    // The <StrictMode> replay, at its worst: setup acquires and starts
    // connecting, cleanup releases and disposes mid-connect, setup acquires
    // again on the same object. `dispose` closes the first socket but leaves
    // its callbacks attached and its initialization continuation suspended,
    // so the first socket's `onerror` still rejects the *first* init
    // promise - whose catch runs `transitionTo("idle")` against the
    // *second* acquisition's "initializing".
    //
    // The second socket then opens into a lifecycle that is back at "idle",
    // where "initialized" is not a legal target, and the manager is wedged
    // with an open socket it will not use.
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    void manager.acquire()
    await Promise.resolve()
    const stale = FakeWebSocket.instances[0]!

    manager.release()

    void manager.acquire()
    await Promise.resolve()
    const live = FakeWebSocket.instances.at(-1)!
    expect(live).not.toBe(stale)

    // The dead socket reports its failure late.
    stale.simulateError(new Error("stale socket died"))
    await Promise.resolve()

    // The live socket connects. This must still complete normally.
    live.simulateOpen()
    await vi.waitFor(() => {
      expect(manager.isInitialized).toBe(true)
    })
    expect(manager.isConnected).toBe(true)
  })
})

describe("WebSocketManager - a superseded init callback", () => {
  it("does not let an abandoned init callback mark a newer attempt initialized", async () => {
    // The window the socket-identity guard cannot close: this attempt got
    // *past* connectSocket and is suspended inside its `init` callback when
    // dispose abandons it. No socket event is involved, so nothing about
    // socket identity helps - when that callback finally resolves, the
    // continuation would run `transitionTo("initialized")` against whatever
    // attempt is current. That transition is legal from "initializing", so
    // it corrupts silently: the manager reports initialized while its real
    // socket is still connecting, and clears the live `initPromise`.
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    let releaseInit: (() => void) | undefined
    const initBlocked = new Promise<void>((resolve) => {
      releaseInit = resolve
    })

    void manager.acquire(() => initBlocked)
    await Promise.resolve()
    FakeWebSocket.instances[0]!.simulateOpen()
    await Promise.resolve()
    await Promise.resolve()

    // Abandoned mid-callback, then taken up again.
    manager.release()
    void manager.acquire()
    await Promise.resolve()
    const live = FakeWebSocket.instances.at(-1)!

    // The abandoned callback finally finishes.
    releaseInit?.()
    await Promise.resolve()
    await Promise.resolve()

    // It must not have spoken for the current attempt, whose socket has not
    // even opened yet.
    expect(manager.isInitialized).toBe(false)

    live.simulateOpen()
    await vi.waitFor(() => {
      expect(manager.isInitialized).toBe(true)
    })
  })
})

describe("WebSocketManager - a dead socket's late events", () => {
  it("cannot write connection state onto the manager that replaced it", async () => {
    // Separate from the initialization generations: this is about a closed
    // socket's final events arriving after a *new* socket is live and
    // connected. Those handlers close over the manager, not the socket, so
    // without an identity check a dead socket's `onclose` flips
    // `isConnected` to false and its `onerror` writes an error - on a
    // connection that is perfectly healthy.
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url)

    void manager.acquire()
    await Promise.resolve()
    const stale = FakeWebSocket.instances[0]!

    manager.release()

    void manager.acquire()
    await Promise.resolve()
    const live = FakeWebSocket.instances.at(-1)!
    expect(live).not.toBe(stale)

    live.simulateOpen()
    await vi.waitFor(() => {
      expect(manager.isInitialized).toBe(true)
    })
    expect(manager.isConnected).toBe(true)

    // The dead socket reports its end, late.
    stale.simulateClose()
    stale.simulateError(new Error("late failure from a closed socket"))
    await Promise.resolve()

    expect(manager.isConnected).toBe(true)
    expect(manager.getSnapshot().error).toBeNull()
  })
})

describe("WebSocketManager - init on reconnect", () => {
  it("runs whatever the stored init delegates to, not a value frozen at acquire", async () => {
    // The reconnect half of the same concern the hook's `initDelegate`
    // addresses, pinned at the manager where `initFunction` actually lives:
    // `acquire` stores its argument once, and `reconnect` runs that stored
    // copy. A caller that keeps its real callback behind a mutable cell must
    // see the *current* one on every reconnect, or a dropped socket silently
    // restores the configuration from mount.
    vi.useFakeTimers()
    const url = nextUrl()
    const manager = WebSocketManager.getInstance(url, {
      autoReconnect: true,
      reconnectInterval: 100,
      maxReconnectAttempts: 3,
    })

    const calls: Array<string> = []
    const cell = {
      current: (): void => {
        calls.push("from-acquire")
      },
    }
    const delegate = (): void => cell.current()

    const p = manager.acquire(delegate)
    FakeWebSocket.instances[0]!.simulateOpen()
    await p
    expect(calls).toEqual(["from-acquire"])

    // The caller's real callback changes after the manager stored the
    // delegate.
    cell.current = (): void => {
      calls.push("current")
    }

    FakeWebSocket.instances[0]!.simulateClose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)

    FakeWebSocket.instances[1]!.simulateOpen()
    await vi.advanceTimersByTimeAsync(0)

    expect(calls).toEqual(["from-acquire", "current"])
  })
})
