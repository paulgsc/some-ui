import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"
import {
  WebSocketManager,
  type InitFunction,
  type WebSocketSnapshot,
} from "@ws/lib/manager"
import { z } from "zod"

/** Returned by the no-manager `subscribe`; a shared constant so the
 * subscription identity is stable across renders. */
const NO_OP_UNSUBSCRIBE = (): void => {}

/**
 * The snapshot a `url`-less hook reports, forever.
 *
 * Frozen and module-level because `useSyncExternalStore` compares the value
 * `getSnapshot` returns by identity: a fresh object literal per call reads
 * as "the store changed" on every render and spins.
 *
 * Left un-annotated so it stays assignable to `WebSocketSnapshot<I>` for
 * every `I` on its own terms - `lastMessage: null` inhabits `I | null`
 * whatever `I` turns out to be - rather than needing a cast to claim it.
 */
const DISCONNECTED_SNAPSHOT = Object.freeze({
  isConnected: false,
  isInitializing: false,
  error: null,
  lastMessage: null,
  parseErrorCount: 0,
  reconnectAttempts: 0,
})

export type UseWebSocketOptions<I, O> = {
  /**
   * The socket to open, or `undefined` for "this runtime has no socket to
   * open" - a bundled build with no companion server behind it, an HTTPS
   * page that would only be blocked as mixed content, SSR. That is a
   * supported steady state, not an error: the hook reports a calm
   * disconnected snapshot, never dials, and never schedules a reconnect,
   * so a surface that wants one can render its offline form off
   * `isConnected` without a special case for "not configured".
   *
   * `resolveLanSocketUrl` returns exactly this shape and is the intended
   * source for a companion-server URL.
   */
  url: string | undefined
  incomingMessageSchema: z.ZodType<I>
  outgoingMessageSchema?: z.ZodType<O>
  autoReconnect?: boolean
  reconnectInterval?: number

  // Lifecycle callbacks
  init?: InitFunction
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event | Error) => void
  onIncomingMessage?: (message: I) => void

  debugMode?: boolean
}

export type UseWebSocketReturn<I, O> = {
  lastMessage: I | null
  isConnected: boolean
  isInitializing: boolean
  error: string | null
  parseErrorCount: number

  sendMessage: (message: O) => void
  sendSerialized: (message: O) => Promise<void>

  /** Direct manager access for advanced use; `null` when `url` was
   * `undefined` and no connection was ever attempted. */
  manager: WebSocketManager | null
}

/**
 * Generic WebSocket hook with singleton coordination
 *
 * Guarantees:
 * - One WebSocket connection per URL across all components
 * - Atomic initialization with serialized init callback
 * - Serialized mutations when using sendSerialized
 * - Automatic cleanup when last component unmounts
 * - No client-side history (use onIncomingMessage for app-specific buffering)
 */
export function useWebSocket<I, O = unknown>({
  url,
  incomingMessageSchema,
  outgoingMessageSchema,
  autoReconnect = true,
  reconnectInterval = 5000,
  init,
  onConnect,
  onDisconnect,
  onError,
  onIncomingMessage,
  debugMode = false,
}: UseWebSocketOptions<I, O>): UseWebSocketReturn<I, O> {
  // Derived from `url`, not frozen at mount. `WebSocketManager` instances
  // are singletons keyed by URL, so recomputing for an unchanged `url` hands
  // back the identical object and nothing downstream re-runs; a changed one
  // yields a new identity that the acquire/release effect below picks up,
  // releasing the old socket before acquiring the new.
  //
  // This was a `useState` initializer, which runs once per mount and so
  // pinned the manager for the component's whole life. Under the old
  // `url: string` that only meant a changing URL was quietly ignored. Now
  // that `undefined` is a meaningful value it was worse in both directions:
  // a hook that mounted without a URL could never connect once one arrived
  // (`useOrchestrator`'s `orchestratorUrl` is an optional prop and may be
  // resolved asynchronously), and one that mounted with a URL kept its
  // socket open after the URL went away - defeating the opt-out this option
  // exists to provide.
  const manager = useMemo(
    () =>
      url === undefined
        ? null
        : WebSocketManager.getInstance(url, {
            autoReconnect,
            reconnectInterval,
            debugMode,
          }),
    [url, autoReconnect, reconnectInterval, debugMode]
  )

  // Subscribe to external store (no React state!). With no manager there is
  // no store to subscribe to, so this degenerates to a subscription that
  // never fires over a frozen snapshot - `useSyncExternalStore` requires
  // `getSnapshot` to be referentially stable between calls or it re-renders
  // forever, which is why DISCONNECTED_SNAPSHOT is a module-level constant
  // rather than an object literal built here.
  const subscribe = useCallback(
    (listener: () => void): (() => void) =>
      manager ? manager.subscribe(listener) : NO_OP_UNSUBSCRIBE,
    [manager]
  )
  const getSnapshot = useCallback(
    (): WebSocketSnapshot<I> =>
      manager ? manager.getSnapshot<I>() : DISCONNECTED_SNAPSHOT,
    [manager]
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Store callbacks in ref to avoid dependency issues
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onError,
    onIncomingMessage,
  })

  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onError,
      onIncomingMessage,
    }
  }, [onConnect, onDisconnect, onError, onIncomingMessage])

  /**
   * `init` held the same way, and for a sharper reason than the others.
   *
   * The acquire/release effect below used to list it as a dependency, which
   * made the *acquisition* churn whenever the caller's `init` identity did.
   * That is not hypothetical: `useOrchestrator` builds its own with
   * `useCallback(..., [scenes, stream_id])`, and `scenes` is an array prop,
   * so any caller passing an array literal re-creates `init` on every
   * render. The effect then released and re-acquired on every render - which
   * with the unconditional release is a full dispose and reconnect each
   * time, every one of them pushing a new snapshot and provoking the next
   * render. React gives up on that loop with "Maximum update depth
   * exceeded" and the tree renders nothing at all.
   *
   * A ref is the honest shape regardless: `init` is only consulted on the
   * first acquire of a manager (`acquire` stores it when the count goes to
   * one), so it was never something an acquisition should be keyed on.
   */
  const initRef = useRef(init)

  useEffect(() => {
    initRef.current = init
  }, [init])

  /**
   * What `acquire` actually receives: a stable function that reads the ref
   * when it runs, rather than the `init` that happened to be current at
   * acquisition time.
   *
   * The indirection is not ceremony. `acquire` copies its argument into
   * `initFunction` once, when the reference count reaches one, and the
   * manager runs *that* copy both on initialization and on every automatic
   * reconnect. Handing over `initRef.current` would therefore freeze the
   * callback as of the acquiring render: props that change while the socket
   * is still connecting never reach the wire, and every later reconnect
   * re-sends the configuration from mount. For `useOrchestrator` that is a
   * reconnect that silently restores stale `scenes`/`stream_id`.
   *
   * Stable identity is what lets the effect stay keyed on `[manager]`, so
   * this buys freshness without reintroducing the acquisition churn.
   */
  const initDelegate = useCallback(
    (manager: WebSocketManager): void | Promise<void> =>
      initRef.current?.(manager),
    []
  )

  const handleMessage = useCallback(
    (data: unknown) => {
      const result = incomingMessageSchema.safeParse(data)

      if (!result.success) {
        // eslint-disable-next-line no-console
        console.warn("WebSocket schema mismatch", {
          data,
          error: z.treeifyError(result.error),
        })

        callbacksRef.current.onError?.(
          new Error("Incoming message schema mismatch")
        )

        return
      }

      callbacksRef.current.onIncomingMessage?.(result.data)
    },
    [incomingMessageSchema]
  )

  const handleConnection = useCallback((connected: boolean) => {
    if (connected) {
      if (callbacksRef.current.onConnect) {
        callbacksRef.current.onConnect()
      }
    } else if (callbacksRef.current.onDisconnect) {
      callbacksRef.current.onDisconnect()
    }
  }, [])

  const handleError = useCallback((error: Event | Error) => {
    if (callbacksRef.current.onError) {
      callbacksRef.current.onError(error)
    }
  }, [])

  // Acquire/release lifecycle
  useEffect(() => {
    if (!manager) return

    // `acquire` takes the reference *synchronously* - `refCounter.acquire()`
    // is its first statement - and only then awaits initialization. So the
    // reference is owed back from the moment this call is made, not from the
    // moment its promise settles, and the cleanup releases unconditionally.
    //
    // Keying the release on the resolved promise (an `acquired` flag set
    // after the `await`) leaked one reference every time this effect was torn
    // down while still initializing: the count never fell back to zero, so
    // `onZero` never fired, `dispose()` never ran, and the socket stayed open
    // with its reconnect timer. Rare when only unmounts could race it;
    // routine now that `url` may change mid-connection, which is the
    // "inverse transition leaves the old socket active" half of this.
    //
    // A rejected acquisition still incremented the count, so it is released
    // like any other - it is reported here rather than swallowed at the call.
    manager.acquire(initDelegate).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("Failed to acquire connection:", err)
    })

    return (): void => {
      manager.release()
    }
    // Keyed on the manager alone - see `initRef` and `initDelegate`.
  }, [manager, initDelegate])

  // Attach message/connection/error listeners
  useEffect(() => {
    if (!manager) return

    const removeMessage = manager.addMessageListener(handleMessage)
    const removeConnection = manager.addConnectionListener(handleConnection)
    const removeError = manager.addErrorListener(handleError)

    return (): void => {
      removeMessage()
      removeConnection()
      removeError()
    }
  }, [manager, handleMessage, handleConnection, handleError])

  const sendMessage = useCallback(
    (message: O) => {
      if (!manager?.isConnected) {
        // eslint-disable-next-line no-console
        console.error("Cannot send message: WebSocket is not connected")
        return
      }

      try {
        // Validate outgoing message if schema provided
        if (outgoingMessageSchema) {
          outgoingMessageSchema.parse(message)
        }

        manager.sendMessage(message)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "Failed to send message:",
          err instanceof Error ? err.message : String(err)
        )
      }
    },
    [manager, outgoingMessageSchema]
  )

  const sendSerialized = useCallback(
    async (message: O) => {
      if (!manager?.isConnected) {
        throw new Error("Cannot send message: WebSocket is not connected")
      }

      try {
        // Validate outgoing message if schema provided
        if (outgoingMessageSchema) {
          outgoingMessageSchema.parse(message)
        }

        await manager.sendSerialized(message)
      } catch (err) {
        const errorMessage = `Failed to send message: ${
          err instanceof Error ? err.message : String(err)
        }`
        // eslint-disable-next-line no-console
        console.error(errorMessage)
        throw err
      }
    },
    [manager, outgoingMessageSchema]
  )

  return useMemo(
    () => ({
      lastMessage: snapshot.lastMessage,
      isConnected: snapshot.isConnected,
      isInitializing: snapshot.isInitializing,
      error: snapshot.error,
      parseErrorCount: snapshot.parseErrorCount,
      sendMessage,
      sendSerialized,
      manager,
    }),
    [snapshot, sendMessage, sendSerialized, manager]
  )
}
