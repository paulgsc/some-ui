import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { WebSocketManager, type InitFunction } from "@ws/lib/manager"
import { z } from "zod"

export type UseWebSocketOptions<I, O> = {
  url: string
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

  // Direct manager access for advanced use
  manager: WebSocketManager
}

/**
 * WebSocket hook over the per-URL singleton manager: one connection across
 * components, cleaned up when the last unmounts. Keeps no message history
 * (buffer in `onIncomingMessage`).
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
  // Get singleton manager instance (lazy-initialized once per mount)
  const [manager] = useState<WebSocketManager>(() =>
    WebSocketManager.getInstance(url, {
      autoReconnect,
      reconnectInterval,
      debugMode,
    })
  )

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    () => manager.getSnapshot<I>(),
    () => manager.getSnapshot<I>()
  )

  // Latest callbacks in a ref, so they are not effect dependencies.
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

  useEffect(() => {
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
      if (!manager.isConnected) {
        // eslint-disable-next-line no-console
        console.error("Cannot send message: WebSocket is not connected")
        return
      }

      try {
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
      if (!manager.isConnected) {
        throw new Error("Cannot send message: WebSocket is not connected")
      }

      try {
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
