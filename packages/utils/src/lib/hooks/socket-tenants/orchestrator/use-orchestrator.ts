import { useCallback, useEffect, useRef, useState } from "react"
import type { WebSocketManager } from "@utils/lib/hooks/websocket"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  IncomingOrchestratorEvent,
  OrchestratorCommand,
  OrchestratorState,
  OutgoingMessage,
  SceneConfig,
} from "some-types-utils"
import {
  defaultOrchestratorState,
  IncomingOrchestratorEventSchema,
  OutgoingMessageSchema,
} from "some-types-utils"

export type UseOrchestratorConfig = {
  stream_id: string
  scenes: Array<SceneConfig>
  orchestratorUrl?: string
  autoStart?: boolean
  onSceneChange?: (fromScene: string | null, toScene: string | null) => void
  onStreamEnd?: () => void
  onError?: (error: string) => void
}

export type UseOrchestratorReturn = {
  // State
  state: OrchestratorState
  isConnected: boolean
  isInitializing: boolean
  error: string | null

  // Actions
  start: () => void
  stop: () => void
  reset: () => void
  pause: () => void
  resume: () => void
  forceScene: (scene: string) => void
  skipCurrentScene: () => void
  updateStreamStatus: (
    isStreaming: boolean,
    streamTime: number,
    timecode: string
  ) => void
}

/**
 * Orchestrator hook - declarative protocol layer over WebSocket
 *
 * Guarantees:
 * - Single initialization per URL across all components
 * - Serialized protocol commands
 * - No duplicate subscriptions or configurations
 */
export function useOrchestrator({
  stream_id,
  scenes,
  orchestratorUrl,
  autoStart = false,
  onSceneChange,
  onStreamEnd,
  onError,
}: UseOrchestratorConfig): UseOrchestratorReturn {
  const [state, setState] = useState<OrchestratorState>({
    ...defaultOrchestratorState,
    scenes,
    total_duration: 0,
    time_remaining: 0,
  })

  const previousSceneRef = useRef<string | null>(null)

  // Store callbacks in ref to avoid dependency issues
  const callbacksRef = useRef({ onSceneChange, onStreamEnd, onError })
  useEffect(() => {
    callbacksRef.current = { onSceneChange, onStreamEnd, onError }
  }, [onSceneChange, onStreamEnd, onError])

  // Store stream_id and scenes in ref for stable init callback
  const configRef = useRef({ stream_id, scenes })
  useEffect(() => {
    configRef.current = { stream_id, scenes }
  }, [stream_id, scenes])

  // STABLE init callback - doesn't change on every render
  const init = useCallback(async (manager: WebSocketManager) => {
    console.log("🚀 Orchestrator init (atomic, singleton)")

    // Subscribe to state updates
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["orchestratorState"],
    })

    const { stream_id: sid, scenes: sceneList } = configRef.current

    // Configure with initial scenes
    if (sceneList.length > 0) {
      await manager.sendSerialized({
        type: "tickCommand",
        stream_id: sid,
        command: {
          Reconfigure: { scenes: sceneList },
        },
      })
    }
  }, [])

  const sendSerializedRef = useRef<
    typeof useWebSocket.prototype.sendSerialized | null
  >(null)

  const handleIncoming = useCallback((event: IncomingOrchestratorEvent) => {
    // Auto-respond to ping with pong
    if (event.type === "ping") {
      sendSerializedRef.current?.({ type: "pong" }).catch((err: Error) => {
        console.error("Failed to send pong:", err)
      })
      return
    }

    if (event.type === "orchestratorState") {
      const incomingState = event.state

      setState((prev) => {
        // Build a merged nextState
        const next: OrchestratorState = {
          ...incomingState,
          // Preserve local scenes if server doesn't send them
          scenes:
            incomingState.scenes && incomingState.scenes.length > 0
              ? incomingState.scenes
              : prev.scenes,
          total_duration:
            incomingState.total_duration && incomingState.total_duration > 0
              ? incomingState.total_duration
              : prev.total_duration,
        }

        // Identity check - if nothing changed, return prev to avoid re-render
        const changed =
          next.current_active_scene !== prev.current_active_scene ||
          next.is_running !== prev.is_running ||
          next.is_paused !== prev.is_paused ||
          next.current_time !== prev.current_time ||
          next.time_remaining !== prev.time_remaining ||
          JSON.stringify(next.scenes) !== JSON.stringify(prev.scenes)

        if (!changed) {
          return prev
        }

        // Scene change detection: use previousSceneRef (shared mutable)
        const prevScene = previousSceneRef.current
        const nextScene = next.current_active_scene

        if (prevScene !== nextScene) {
          // Update the ref now (ensures single authoritative update)
          previousSceneRef.current = nextScene

          // Call callback asynchronously to avoid reentrancy during state update
          queueMicrotask(() => {
            const cb = callbacksRef.current.onSceneChange
            if (cb) cb(prevScene, nextScene)
          })
        }

        return next
      })
    } else if (event.type === "error") {
      const cb = callbacksRef.current.onError
      if (cb) cb(event.message)
    }
  }, [])

  const ws = useWebSocket<IncomingOrchestratorEvent, OutgoingMessage>({
    url: orchestratorUrl || `ws://${window.location.hostname}:3000/ws`,
    incomingMessageSchema: IncomingOrchestratorEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: true,

    init,

    // Pass our stable handler
    onIncomingMessage: handleIncoming,
  })

  // Update sendSerializedRef when ws changes
  useEffect(() => {
    sendSerializedRef.current = ws.sendSerialized
  }, [ws.sendSerialized])

  // Reconfigure when scenes change (serialized, guarded)
  const previousScenesRef = useRef<string>("")
  useEffect(() => {
    if (!ws.isConnected || scenes.length === 0) return

    const scenesHash = JSON.stringify(scenes)
    if (scenesHash === previousScenesRef.current) return

    const serverScenes = state.scenes ?? []
    const serverHash = JSON.stringify(serverScenes)
    if (serverHash === scenesHash) {
      previousScenesRef.current = scenesHash
      return
    }

    previousScenesRef.current = scenesHash

    // Use ref to call sendSerialized (defensive)
    sendSerializedRef
      .current?.({
        type: "tickCommand",
        stream_id,
        command: {
          Reconfigure: { scenes },
        },
      })
      .catch((err: Error) => {
        console.error("Failed to reconfigure:", err)
      })
  }, [scenes, ws.isConnected, stream_id, state.scenes])

  // Update local state when scenes prop changes
  useEffect(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setState((prev) => {
      const next = {
        ...prev,
        scenes,
        total_duration: totalDuration,
        time_remaining: totalDuration - prev.current_time,
      }

      // Only update if something actually changed
      if (
        JSON.stringify(prev.scenes) === JSON.stringify(next.scenes) &&
        prev.total_duration === next.total_duration &&
        prev.time_remaining === next.time_remaining
      ) {
        return prev
      }

      return next
    })
  }, [scenes])

  // --- Serialized Command Helpers ---
  const sendCommand = useCallback(
    (command: OrchestratorCommand) => {
      sendSerializedRef
        .current?.({
          type: "tickCommand",
          stream_id,
          command,
        })
        .catch((err: Error) => {
          console.error("Failed to send command:", err)
        })
    },
    [stream_id]
  )

  const start = useCallback(
    () => sendCommand({ Start: { scenes } }),
    [sendCommand, scenes]
  )

  const stop = useCallback(() => {
    sendCommand({ Stop: null })
    previousSceneRef.current = null
  }, [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ Reset: null })
    previousSceneRef.current = null
  }, [sendCommand])

  const pause = useCallback(() => sendCommand({ Pause: null }), [sendCommand])

  const resume = useCallback(() => sendCommand({ Resume: null }), [sendCommand])

  const forceScene = useCallback(
    (scene: string) => {
      sendCommand({ ForceScene: scene })
      previousSceneRef.current = scene
    },
    [sendCommand]
  )

  const skipCurrentScene = useCallback(
    () => sendCommand({ SkipCurrentScene: null }),
    [sendCommand]
  )

  const updateStreamStatus = useCallback(
    (is_streaming: boolean, stream_time: number, timecode: string) => {
      sendCommand({
        UpdateStreamStatus: {
          is_streaming,
          stream_time,
          timecode,
        },
      })

      // Auto-start/stop based on stream status
      if (autoStart) {
        if (is_streaming && !state.is_running) {
          start()
        } else if (!is_streaming && state.is_running) {
          stop()
          if (callbacksRef.current.onStreamEnd) {
            callbacksRef.current.onStreamEnd()
          }
        }
      }
    },
    [sendCommand, autoStart, start, stop, state.is_running]
  )

  return {
    // WebSocket state
    isConnected: ws.isConnected,
    isInitializing: ws.isInitializing,
    error: ws.error,

    // Orchestrator state
    state,

    // Actions (all serialized)
    start,
    stop,
    reset,
    pause,
    resume,
    forceScene,
    skipCurrentScene,
    updateStreamStatus,
  }
}
