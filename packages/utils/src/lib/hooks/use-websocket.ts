import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

/**
 * Generic WebSocket hook options
 */
export type UseWebSocketOptions<I, U> = {
  url: string
  incomingMessageSchema: z.ZodType<I>
  outgoingMessageSchema?: z.ZodType<U>
  autoReconnect?: boolean
  reconnectInterval?: number
  maxMessages?: number
  maxParseErrors?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event | Error) => void
  onIncomingMessage?: (message: I) => void
  debugMode?: boolean
}

export type UseWebSocketReturn<I, U> = {
  lastMessage: I | null
  messages: Array<I>
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  parseErrors: Array<z.ZodError>
  sendMessage: (message: U) => void
  connect: () => void
  disconnect: () => void
  clearMessages: () => void
  clearError: () => void
}

export function useWebSocket<I, U = unknown>({
  url,
  incomingMessageSchema,
  outgoingMessageSchema,
  autoReconnect = true,
  reconnectInterval = 5000,
  maxMessages = 1000,
  maxParseErrors = 100,
  onConnect,
  onDisconnect,
  onError,
  onIncomingMessage,
  debugMode = false,
}: UseWebSocketOptions<I, U>): UseWebSocketReturn<I, U> {
  const [lastMessage, setLastMessage] = useState<I | null>(null)
  const [messages, setMessages] = useState<Array<I>>([])
  const [parseErrors, setParseErrors] = useState<Array<z.ZodError>>([])

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualDisconnectRef = useRef(false)
  const connectionStateRef = useRef<
    "disconnected" | "connecting" | "connected"
  >("disconnected")

  // Store stable references to schemas and callbacks to prevent infinite loops
  const schemaRef = useRef(incomingMessageSchema)
  const outgoingSchemaRef = useRef(outgoingMessageSchema)
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onError,
    onIncomingMessage,
  })

  // Update refs when props change
  useEffect(() => {
    schemaRef.current = incomingMessageSchema
  }, [incomingMessageSchema])

  useEffect(() => {
    outgoingSchemaRef.current = outgoingMessageSchema
  }, [outgoingMessageSchema])

  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onError,
      onIncomingMessage,
    }
  }, [onConnect, onDisconnect, onError, onIncomingMessage])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
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

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const sendMessage = useCallback(
    (message: U) => {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN ||
        connectionStateRef.current !== "connected"
      ) {
        setError("Cannot send message: WebSocket is not connected")
        return
      }

      try {
        // Validate outgoing message if schema is provided
        if (outgoingSchemaRef.current) {
          try {
            outgoingSchemaRef.current.parse(message)
          } catch (err) {
            if (err instanceof z.ZodError) {
              const errorMessage = `Invalid outgoing message: ${err.issues.map((e) => e.message).join(", ")}`
              setError(errorMessage)
              log("Message validation error:", err)
              return
            }
          }
        }

        // Send the message
        socketRef.current.send(JSON.stringify(message))
        log("Sent message:", message)

        // Clear any previous errors on successful send
        setError(null)
      } catch (err) {
        const errorMessage = `Failed to send message: ${err instanceof Error ? err.message : String(err)}`
        setError(errorMessage)
        log("Send error:", err)

        if (callbacksRef.current.onError && err instanceof Error) {
          callbacksRef.current.onError(err)
        }
      }
    },
    [log]
  )

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (connectionStateRef.current === "connecting") {
      log("Connection already in progress")
      return
    }

    // Clear manual disconnect flag
    manualDisconnectRef.current = false

    // Clear any existing connection
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    // Clear any previous reconnect timer
    clearReconnectTimer()

    try {
      connectionStateRef.current = "connecting"
      setIsConnecting(true)
      setError(null)
      log("Connecting to", url)

      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = (): void => {
        // Check if this is still the current socket (not replaced during connection)
        if (socketRef.current === socket) {
          connectionStateRef.current = "connected"
          setIsConnected(true)
          setIsConnecting(false)
          setError(null)
          log("Connected")

          if (callbacksRef.current.onConnect) {
            callbacksRef.current.onConnect()
          }
        }
      }

      socket.onmessage = (event): void => {
        // Only process messages if this is still the current socket
        if (socketRef.current !== socket) {
          return
        }

        try {
          const data = JSON.parse(event.data)

          // Validate incoming message
          const result = schemaRef.current.safeParse(data)

          if (result.success) {
            const validatedMessage = result.data
            setLastMessage(validatedMessage)
            setMessages((prev) => {
              const newMessages = [...prev, validatedMessage]
              // Limit messages array size
              return newMessages.length > maxMessages
                ? newMessages.slice(-maxMessages)
                : newMessages
            })

            if (callbacksRef.current.onIncomingMessage) {
              callbacksRef.current.onIncomingMessage(validatedMessage)
            }
          } else {
            log("Validation error:", result.error)
            setParseErrors((prev) => {
              const newErrors = [...prev, result.error]
              // Limit parse errors array size
              return newErrors.length > maxParseErrors
                ? newErrors.slice(-maxParseErrors)
                : newErrors
            })
          }
        } catch (err) {
          log("Failed to parse message:", err)
          setError(
            `Failed to parse message: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      socket.onclose = (event): void => {
        // Only handle close event if this is still the current socket
        if (socketRef.current === socket) {
          connectionStateRef.current = "disconnected"
          setIsConnected(false)
          setIsConnecting(false)
          log("Disconnected, code:", event.code, "reason:", event.reason)

          if (callbacksRef.current.onDisconnect) {
            callbacksRef.current.onDisconnect()
          }

          // Set up reconnection if enabled and not manually disconnected
          if (autoReconnect && !manualDisconnectRef.current) {
            log("Reconnecting in", reconnectInterval, "ms")
            reconnectTimerRef.current = setTimeout(() => {
              connect()
            }, reconnectInterval)
          }
        }
      }

      socket.onerror = (e): void => {
        // Only handle error if this is still the current socket
        if (socketRef.current === socket) {
          setError("WebSocket connection error")
          connectionStateRef.current = "disconnected"
          setIsConnecting(false)
          log("Connection error:", e)

          if (callbacksRef.current.onError) {
            callbacksRef.current.onError(e)
          }
        }
      }
    } catch (err) {
      connectionStateRef.current = "disconnected"
      setIsConnecting(false)
      const errorMessage = `Failed to connect: ${err instanceof Error ? err.message : String(err)}`
      setError(errorMessage)
      log("Connection setup error:", err)

      if (callbacksRef.current.onError && err instanceof Error) {
        callbacksRef.current.onError(err)
      }
    }
  }, [
    url,
    autoReconnect,
    reconnectInterval,
    clearReconnectTimer,
    log,
    maxMessages,
    maxParseErrors,
  ])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    log("Manually disconnecting")
    manualDisconnectRef.current = true
    clearReconnectTimer()

    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    connectionStateRef.current = "disconnected"
    setIsConnected(false)
    setIsConnecting(false)
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
      manualDisconnectRef.current = true
      clearReconnectTimer()
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [connect, clearReconnectTimer])

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
    clearError,
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
