import { useCallback, useEffect, useRef } from "react"
import type {
  IncomingEvent,
  ObsCommand,
  OutgoingObsEvent,
} from "@some-ui/types"
import { IncomingEventSchema, OutgoingObsEventSchema } from "@some-ui/types"
import { useWebSocket } from "@some-ui/ws"
import type { UseWebSocketOptions, WebSocketManager } from "@some-ui/ws"

import { useObsStore } from "../../context/zustand-store/obs-store"

type UseObsStatusOptions = Omit<
  UseWebSocketOptions<IncomingEvent, OutgoingObsEvent>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
>

/**
 * Hook to connect to OBS WebSocket and sync state to Zustand store.
 *
 * The store separates state into temporal layers:
 * - High-frequency state (stats, timecodes) - updates frequently
 * - Low-frequency state (scenes, inputs, settings) - updates rarely
 *
 * Components can subscribe to specific selectors to avoid unnecessary rerenders.
 *
 * @example
 * ```tsx
 * // In your root component or connection manager
 * useObsStatusWebSocket({ url: "ws://localhost:4455" })
 *
 * // In child components, use selectors
 * import { useScenes, useIsStreaming, useObsCommands } from './obs-store'
 *
 * function SceneList() {
 *   const scenes = useScenes() // Only rerenders when scenes change
 *   const { switchScene } = useObsCommands()
 *   // ...
 * }
 *
 * function StreamingButton() {
 *   const isStreaming = useIsStreaming() // Only rerenders when streaming status changes
 *   const { startStreaming, stopStreaming } = useObsCommands()
 *   // ...
 * }
 *
 * function StatsDisplay() {
 *   const stats = useObsStats() // Rerenders frequently - opt-in only!
 *   // ...
 * }
 * ```
 */
export function useObsStatus(options: UseObsStatusOptions): {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
} {
  const handleEvent = useObsStore((s) => s._handleEvent)
  const setConnectionStatus = useObsStore((s) => s._setConnectionStatus)
  const setCommandSender = useObsStore((s) => s._setCommandSender)
  const reset = useObsStore((s) => s._reset)

  const sendRef = useRef<((msg: OutgoingObsEvent) => Promise<void>) | null>(
    null
  )

  const init = useCallback(async (manager: WebSocketManager) => {
    // Subscribe to OBS status updates
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["obsStatus"],
    })
  }, [])

  const ws = useWebSocket<IncomingEvent, OutgoingObsEvent>({
    url: options.url,
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: OutgoingObsEventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 5000,
    debugMode: options.debugMode ?? false,
    init,
    onIncomingMessage: (event) => {
      // Forward to user's handler first
      if (options.onIncomingMessage) {
        options.onIncomingMessage(event)
      }

      // Update store - now uses internal event handler
      if (event.type === "obsStatus") {
        handleEvent(event.status)
      }
    },
    onConnect: (...args) => {
      setConnectionStatus(true)
      if (options.onConnect) {
        options.onConnect(...args)
      }
    },
    onDisconnect: (...args) => {
      setConnectionStatus(false, "Disconnected")
      if (options.onDisconnect) {
        options.onDisconnect(...args)
      }
    },
    onError: (error, ...args) => {
      setConnectionStatus(false, "foo")
      if (options.onError) {
        options.onError(error, ...args)
      }
    },
  })

  // Keep sendSerialized ref up to date
  useEffect(() => {
    sendRef.current = ws.sendSerialized
  }, [ws.sendSerialized])

  // Set up command sender that wraps commands in the proper envelope
  // CRITICAL: Must depend on sendRef.current to ensure sender is rebound when WebSocket updates
  useEffect(() => {
    if (!ws.isConnected || !sendRef.current) {
      // Set to null, not a throwing function - the store's warn() will handle it
      setCommandSender(null)
      return
    }

    // Command sender wraps the ObsCommand in the OutgoingObsEvent envelope
    const sendCommand = async (cmd: ObsCommand): Promise<void> => {
      await sendRef.current!({
        type: "obsCmd",
        cmd,
      })
    }

    setCommandSender(sendCommand)
  }, [ws.isConnected, sendRef.current, setCommandSender])

  // Clean up: reset state on unmount
  useEffect(() => {
    return (): void => {
      reset()
      setCommandSender(null)
    }
  }, [reset, setCommandSender])

  // Return minimal interface - commands are in the store
  return {
    isConnected: ws.isConnected,
    isConnecting: ws.isInitializing,
    error: ws.error,
  }
}
