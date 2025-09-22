import { useCallback, useEffect, useRef, useState } from "react"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

/**
 * WebSocket connection manager - singleton per URL
 */
class WebSocketManager {
  private static instances = new Map<string, WebSocketManager>()
  private socket: WebSocket | null = null
  private listeners = new Set<(data: unknown) => void>()
  private connectionListeners = new Set<(connected: boolean) => void>()
  private errorListeners = new Set<(error: Event | Error) => void>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualDisconnect = false
  private connectionState: "disconnected" | "connecting" | "connected" =
    "disconnected"

  constructor(
    private url: string,
    private autoReconnect = true,
    private reconnectInterval = 5000,
    private debugMode = false
  ) {}

  static getInstance(
    url: string,
    options?: {
      autoReconnect?: boolean
      reconnectInterval?: number
      debugMode?: boolean
    }
  ): WebSocketManager {
    if (!this.instances.has(url)) {
      this.instances.set(
        url,
        new WebSocketManager(
          url,
          options?.autoReconnect,
          options?.reconnectInterval,
          options?.debugMode
        )
      )
    }
    return this.instances.get(url)!
  }

  private log(...args: Array<unknown>): void {
    if (this.debugMode) {
      console.log(`[WebSocket ${this.url}]`, ...args)
    }
  }

  addMessageListener(callback: (data: unknown) => void): void {
    this.listeners.add(callback)
  }

  removeMessageListener(callback: (data: unknown) => void): void {
    this.listeners.delete(callback)
  }

  addConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.add(callback)
  }

  removeConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.delete(callback)
  }

  addErrorListener(callback: (error: Event | Error) => void): void {
    this.errorListeners.add(callback)
  }

  removeErrorListener(callback: (error: Event | Error) => void): void {
    this.errorListeners.delete(callback)
  }

  connect(): void {
    if (
      this.connectionState === "connecting" ||
      this.connectionState === "connected"
    ) {
      return
    }

    this.manualDisconnect = false
    this.connectionState = "connecting"
    this.clearReconnectTimer()

    try {
      this.socket = new WebSocket(this.url)

      this.socket.onopen = (): void => {
        this.connectionState = "connected"
        this.log("Connected")
        this.connectionListeners.forEach((cb) => cb(true))
      }

      this.socket.onmessage = (event): void => {
        try {
          const data = JSON.parse(event.data)
          this.listeners.forEach((cb) => cb(data))
        } catch (err) {
          this.log("Failed to parse message:", err)
          this.errorListeners.forEach((cb) => cb(err as Error))
        }
      }

      this.socket.onclose = (): void => {
        this.connectionState = "disconnected"
        this.log("Disconnected")
        this.connectionListeners.forEach((cb) => cb(false))

        if (this.autoReconnect && !this.manualDisconnect) {
          this.log("Reconnecting in", this.reconnectInterval, "ms")
          this.reconnectTimer = setTimeout(
            () => this.connect(),
            this.reconnectInterval
          )
        }
      }

      this.socket.onerror = (error): void => {
        this.log("Connection error:", error)
        this.errorListeners.forEach((cb) => cb(error))
      }
    } catch (err) {
      this.connectionState = "disconnected"
      this.log("Connection setup error:", err)
      this.errorListeners.forEach((cb) => cb(err as Error))
    }
  }

  disconnect(): void {
    this.manualDisconnect = true
    this.clearReconnectTimer()

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.connectionState = "disconnected"
  }

  sendMessage(message: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected")
    }
    this.socket.send(JSON.stringify(message))
  }

  get isConnected(): boolean {
    return this.connectionState === "connected"
  }

  get isConnecting(): boolean {
    return this.connectionState === "connecting"
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // Cleanup method for when no components are using this connection
  cleanup(): void {
    if (this.listeners.size === 0 && this.connectionListeners.size === 0) {
      this.disconnect()
      WebSocketManager.instances.delete(this.url)
    }
  }
}

/**
 * Options for the WebSocket hook with TanStack Query integration
 */
export type UseWebSocketQueryOptions<I, U> = {
  url: string
  queryKey: QueryKey
  incomingMessageSchema: z.ZodType<I>
  outgoingMessageSchema?: z.ZodType<U>
  autoReconnect?: boolean
  reconnectInterval?: number
  maxMessages?: number
  maxParseErrors?: number
  // Data transformation options
  updateStrategy?: "append" | "replace" | "merge"
  dataTransformer?: (newData: I, existingData: Array<I> | undefined) => Array<I>
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event | Error) => void
  onIncomingMessage?: (message: I) => void
  debugMode?: boolean
}

export type UseWebSocketQueryReturn<I, U> = {
  data: Array<I> | null
  lastMessage: I | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  parseErrors: Array<z.ZodError>
  sendMessage: (message: U) => void
  connect: () => void
  disconnect: () => void
  clearData: () => void
  clearError: () => void
  refetch: () => void
}

/**
 * WebSocket hook with TanStack Query integration for shared state
 */
export function useWebSocketQuery<I, U = unknown>({
  url,
  queryKey,
  incomingMessageSchema,
  outgoingMessageSchema,
  autoReconnect = true,
  reconnectInterval = 5000,
  maxMessages = 1000,
  maxParseErrors = 100,
  updateStrategy = "append",
  dataTransformer,
  onConnect,
  onDisconnect,
  onError,
  onIncomingMessage,
  debugMode = false,
}: UseWebSocketQueryOptions<I, U>): UseWebSocketQueryReturn<I, U> {
  const queryClient = useQueryClient()
  const [lastMessage, setLastMessage] = useState<I | null>(null)
  const [parseErrors, setParseErrors] = useState<Array<z.ZodError>>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get or create WebSocket manager instance
  const managerRef = useRef<WebSocketManager | null>(null)

  useEffect(() => {
    managerRef.current = WebSocketManager.getInstance(url, {
      autoReconnect,
      reconnectInterval,
      debugMode,
    })
    return (): void => {
      // Cleanup when component unmounts
      if (managerRef.current) {
        managerRef.current.cleanup()
      }
    }
  }, [url, autoReconnect, reconnectInterval, debugMode])

  // Store callbacks in refs to prevent recreation on every render
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

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const updateQueryData = useCallback(
    (newMessage: I) => {
      const existingData = queryClient.getQueryData<Array<I>>(queryKey)

      let updatedData: Array<I>

      if (dataTransformer) {
        updatedData = dataTransformer(newMessage, existingData)
      } else {
        switch (updateStrategy) {
          case "replace":
            updatedData = [newMessage]
            break
          case "merge":
            // Simple merge - you might want to customize this based on your data structure
            updatedData = existingData
              ? [...existingData.slice(-maxMessages + 1), newMessage]
              : [newMessage]
            break
          case "append":
          default:
            updatedData = existingData
              ? [...existingData.slice(-maxMessages + 1), newMessage]
              : [newMessage]
            break
        }
      }

      queryClient.setQueryData(queryKey, updatedData)
      setLastMessage(newMessage)
    },
    [queryClient, queryKey, updateStrategy, maxMessages, dataTransformer]
  )

  const handleMessage = useCallback(
    (data: unknown) => {
      try {
        const result = incomingMessageSchema.safeParse(data)

        if (result.success) {
          const validatedMessage = result.data
          updateQueryData(validatedMessage)

          if (callbacksRef.current.onIncomingMessage) {
            callbacksRef.current.onIncomingMessage(validatedMessage)
          }
        } else {
          setParseErrors((prev) => {
            const newErrors = [...prev, result.error]
            return newErrors.length > maxParseErrors
              ? newErrors.slice(-maxParseErrors)
              : newErrors
          })
        }
      } catch (err) {
        setError(
          `Failed to process message: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    },
    [incomingMessageSchema, updateQueryData, maxParseErrors]
  )

  const handleConnection = useCallback((connected: boolean) => {
    setIsConnected(connected)
    setIsConnecting(false)

    if (connected) {
      setError(null)
      if (callbacksRef.current.onConnect) {
        callbacksRef.current.onConnect()
      }
    } else if (callbacksRef.current.onDisconnect) {
      callbacksRef.current.onDisconnect()
    }
  }, [])

  const handleError = useCallback((error: Event | Error) => {
    setError("WebSocket connection error")
    setIsConnecting(false)

    if (callbacksRef.current.onError) {
      callbacksRef.current.onError(error)
    }
  }, [])

  const sendMessage = useCallback(
    (message: U) => {
      if (!managerRef.current) {
        setError("Websocket global state is not set!")
        return
      }

      if (!managerRef.current.isConnected) {
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
              const errorMessage = `Invalid outgoing message: ${err.issues.map((e) => e.message).join(", ")}`
              setError(errorMessage)
              return
            }
          }
        }

        managerRef.current.sendMessage(message)
        setError(null)
      } catch (err) {
        const errorMessage = `Failed to send message: ${err instanceof Error ? err.message : String(err)}`
        setError(errorMessage)
      }
    },
    [outgoingMessageSchema]
  )

  const connect = useCallback(() => {
    if (managerRef.current) {
      setIsConnecting(true)
      managerRef.current.connect()
    }
  }, [])

  const disconnect = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnect()
    }
  }, [])

  const clearData = useCallback(() => {
    queryClient.setQueryData(queryKey, [])
    setLastMessage(null)
    setParseErrors([])
  }, [queryClient, queryKey])

  const refetch = useCallback(() => {
    // For WebSocket, refetch means reconnect
    if (managerRef.current) {
      const mgr = managerRef.current
      mgr.disconnect()
      setTimeout(() => mgr.connect(), 100)
    }
  }, [])

  // Set up listeners
  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return

    manager.addMessageListener(handleMessage)
    manager.addConnectionListener(handleConnection)
    manager.addErrorListener(handleError)

    // Set initial connection state
    setIsConnected(manager.isConnected)
    setIsConnecting(manager.isConnecting)

    // Connect on mount
    manager.connect()

    return () => {
      manager.removeMessageListener(handleMessage)
      manager.removeConnectionListener(handleConnection)
      manager.removeErrorListener(handleError)
    }
  }, [handleMessage, handleConnection, handleError])

  // Get current data from TanStack Query cache
  const data = queryClient.getQueryData<Array<I>>(queryKey) || null

  return {
    data,
    lastMessage,
    isConnected,
    isConnecting,
    error,
    parseErrors,
    sendMessage,
    connect,
    disconnect,
    clearData,
    clearError,
    refetch,
  }
}

/**
 * Utility hook for simpler WebSocket usage without TanStack Query
 */
export function useWebSocket<I, U = unknown>(
  options: Omit<UseWebSocketQueryOptions<I, U>, "queryKey">
) {
  const queryKey = ["websocket", options.url]
  return useWebSocketQuery({ ...options, queryKey })
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
