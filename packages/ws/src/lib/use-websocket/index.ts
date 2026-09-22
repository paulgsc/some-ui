import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  // Get singleton manager instance (lazy-initialized once per mount).
  // `null` for a `url`-less runtime - see the `url` option. Held in state
  // rather than a memo so the decision is made once per mount and cannot
  // be recomputed into a different manager mid-render.
  const [manager] = useState<WebSocketManager | null>(() =>
    url === undefined
      ? null
      : WebSocketManager.getInstance(url, {
          autoReconnect,
          reconnectInterval,
          debugMode,
        })
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

    let acquired = false

    const acquire = async (): Promise<void> => {
      try {
        await manager.acquire(init)
        acquired = true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to acquire connection:", err)
      }
    }

    void acquire()

    return (): void => {
      // Only release if we successfully acquired
      if (acquired) {
        manager.release()
      }
    }
  }, [manager, init])

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
