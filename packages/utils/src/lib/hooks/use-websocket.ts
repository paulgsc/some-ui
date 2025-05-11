import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

/**
 * Generic WebSocket hook options
 */
type UseWebSocketOptions<TIncomingSchema, TOutgoingSchema> = {
  url: string
  incomingMessageSchema: z.ZodType<TIncomingSchema>
  outgoingMessageSchema?: z.ZodType<TOutgoingSchema>
  autoReconnect?: boolean
  reconnectInterval?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event | Error) => void
  onIncomingMessage?: (message: TIncomingSchema) => void
  debugMode?: boolean
}

type UseWebSocketReturn<TIncomingSchema, TOutgoingSchema> = {
  lastMessage: TIncomingSchema | null
  messages: Array<TIncomingSchema>
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  parseErrors: Array<z.ZodError>
  sendMessage: (message: TOutgoingSchema) => void
  connect: () => void
  disconnect: () => void
  clearMessages: () => void
}

export function useWebSocket<TIncomingSchema, TOutgoingSchema = unknown>({
  url,
  incomingMessageSchema,
  outgoingMessageSchema,
  autoReconnect = true,
  reconnectInterval = 5000,
  onConnect,
  onDisconnect,
  onError,
  onIncomingMessage,
  debugMode = false,
}: UseWebSocketOptions<TIncomingSchema, TOutgoingSchema>): UseWebSocketReturn<
  TIncomingSchema,
  TOutgoingSchema
> {
  const [lastMessage, setLastMessage] = useState<TIncomingSchema | null>(null)
  const [messages, setMessages] = useState<Array<TIncomingSchema>>([])
  const [parseErrors, setParseErrors] = useState<Array<z.ZodError>>([])

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const log = useCallback(
    (...args: Array<unknown>) => {
      if (debugMode) {
        console.log("[WebSocket]", ...args)
      }
    },
    [debugMode]
  )

  const sendMessage = useCallback(
    (message: TOutgoingSchema) => {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN
      ) {
        setError("Cannot send message: WebSocket is not connected")
        return
      }

      try {
        // Validate outgoing message if schema is provided
        if (outgoingMessageSchema) {
          try {
            outgoingMessageSchema.parse(message)
          } catch (err) {
            if (err instanceof z.ZodError) {
              const errorMessage = `Invalid outgoing message: ${err.errors.map((e) => e.message).join(", ")}`
              setError(errorMessage)
              log("Message validation error:", err)
              return
            }
          }
        }

        // Send the message
        socketRef.current.send(JSON.stringify(message))
        log("Sent message:", message)
      } catch (err) {
        const errorMessage = `Failed to send message: ${err instanceof Error ? err.message : String(err)}`
        setError(errorMessage)
        log("Send error:", err)

        if (onError && err instanceof Error) {
          onError(err)
        }
      }
    },
    [outgoingMessageSchema, onError, log]
  )

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Clear any existing connection
    if (socketRef.current) {
      socketRef.current.close()
    }

    // Clear any previous reconnect timer
    clearReconnectTimer()

    try {
      setIsConnecting(true)
      setError(null)
      log("Connecting to", url)

      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = (): void => {
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        log("Connected")

        if (onConnect) {
          onConnect()
        }
      }

      socket.onmessage = (event): void => {
        try {
          const data = JSON.parse(event.data)
          log("Received raw data:", data)

          // Validate incoming message
          const result = incomingMessageSchema.safeParse(data)

          if (result.success) {
            const validatedMessage = result.data
            setLastMessage(validatedMessage)
            setMessages((prev) => [...prev, validatedMessage])

            if (onIncomingMessage) {
              onIncomingMessage(validatedMessage)
            }
          } else {
            log("Validation error:", result.error)
            setParseErrors((prev) => [...prev, result.error])
          }
        } catch (err) {
          log("Failed to parse message:", err)
          setError(
            `Failed to parse message: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      socket.onclose = (event): void => {
        setIsConnected(false)
        setIsConnecting(false)
        log("Disconnected, code:", event.code, "reason:", event.reason)

        if (onDisconnect) {
          onDisconnect()
        }

        // Set up reconnection if enabled
        if (autoReconnect) {
          log("Reconnecting in", reconnectInterval, "ms")
          reconnectTimerRef.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        }
      }

      socket.onerror = (e): void => {
        setError("WebSocket connection error")
        setIsConnecting(false)
        log("Connection error:", e)

        if (onError) {
          onError(e)
        }
      }
    } catch (err) {
      setIsConnecting(false)
      const errorMessage = `Failed to connect: ${err instanceof Error ? err.message : String(err)}`
      setError(errorMessage)
      log("Connection setup error:", err)

      if (onError && err instanceof Error) {
        onError(err)
      }
    }
  }, [
    url,
    autoReconnect,
    reconnectInterval,
    onConnect,
    onDisconnect,
    onError,
    clearReconnectTimer,
    incomingMessageSchema,
    onIncomingMessage,
    log,
  ])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      log("Manually disconnecting")
      socketRef.current.close()
      socketRef.current = null
    }

    clearReconnectTimer()
  }, [clearReconnectTimer, log])

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([])
    setLastMessage(null)
    setParseErrors([])
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()

    return (): void => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    lastMessage,
    messages,
    isConnected,
    isConnecting,
    error,
    parseErrors,
    sendMessage,
    connect,
    disconnect,
    clearMessages,
  }
}

/*
 *
 *
 *
// Example usage for OBS WebSocket
export const createObsWebSocketHook = () => {
  // Define the OBS status schema using Zod
  const obsStatusSchema = z.object({
    streaming: z.boolean(),
    recording: z.boolean(),
    stream_timecode: z.string(),
    recording_timecode: z.string(),
    scenes: z.array(z.string()),
    current_scene: z.string(),
  })

  // Define the OBS command schema using Zod
  const obsCommandSchema = z.object({
    action: z.enum([
      "startStreaming",
      "stopStreaming",
      "startRecording",
      "stopRecording",
      "setScene",
    ]),
    params: z.record(z.string(), z.unknown()).optional(),
  })

  // Type inference from schemas
  type ObsStatus = z.infer<typeof obsStatusSchema>
  type ObsCommand = z.infer<typeof obsCommandSchema>

  // Create a custom hook that uses the generic WebSocket hook
  return (
    options: Omit<
      UseWebSocketOptions<ObsStatus, ObsCommand>,
      "incomingMessageSchema" | "outgoingMessageSchema"
    > = {}
  ) => {
    const wsHook = useWebSocket<ObsStatus, ObsCommand>({
      url:
        options.url ||
        `ws://${window.location.hostname}:${window.location.port}/ws/obs`,
      incomingMessageSchema: obsStatusSchema,
      outgoingMessageSchema: obsCommandSchema,
      ...options,
    })

    // Add OBS-specific helper functions
    const startStreaming = useCallback(() => {
      wsHook.sendMessage({
        action: "startStreaming",
      })
    }, [wsHook])

    const stopStreaming = useCallback(() => {
      wsHook.sendMessage({
        action: "stopStreaming",
      })
    }, [wsHook])

    const startRecording = useCallback(() => {
      wsHook.sendMessage({
        action: "startRecording",
      })
    }, [wsHook])

    const stopRecording = useCallback(() => {
      wsHook.sendMessage({
        action: "stopRecording",
      })
    }, [wsHook])

    const setScene = useCallback(
      (sceneName: string) => {
        wsHook.sendMessage({
          action: "setScene",
          params: { scene: sceneName },
        })
      },
      [wsHook]
    )

    const isSceneAvailable = useCallback(
      (sceneName: string) =>
        wsHook.lastMessage?.scenes.includes(sceneName) ?? false,
      [wsHook.lastMessage?.scenes]
    )

    return {
      ...wsHook,
      status: wsHook.lastMessage,
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      setScene,
      isSceneAvailable,
    }
  }
}

// Example usage
export const useObsWebSocket = createObsWebSocketHook()
*
*
*
*/
