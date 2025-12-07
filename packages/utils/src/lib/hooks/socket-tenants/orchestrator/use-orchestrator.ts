import { useCallback, useEffect, useRef, useState } from "react"
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
  // Calculate initial total duration from scenes
  const initialTotalDuration = scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0
  )

  const [state, setState] = useState<OrchestratorState>({
    ...defaultOrchestratorState,
    scenes,
    total_duration: initialTotalDuration,
    time_remaining: initialTotalDuration,
  })

  const previousSceneRef = useRef<string | null>(null)

  // Store callbacks in ref to avoid dependency issues
  const callbacksRef = useRef({ onSceneChange, onStreamEnd, onError })
  useEffect(() => {
    callbacksRef.current = { onSceneChange, onStreamEnd, onError }
  }, [onSceneChange, onStreamEnd, onError])

  // WebSocket with atomic init - runs ONCE per URL
  const ws = useWebSocket<IncomingOrchestratorEvent, OutgoingMessage>({
    url: orchestratorUrl || `ws://${window.location.hostname}:3000/ws`,
    incomingMessageSchema: IncomingOrchestratorEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: true,

    // Init callback - runs ONCE atomically on first acquire
    init: async (manager) => {
      console.log("🚀 Orchestrator init (atomic, singleton)")

      // Subscribe to state updates
      await manager.sendSerialized({
        type: "subscribe",
        event_types: ["orchestratorState"],
      })

      // Configure with initial scenes
      if (scenes.length > 0) {
        await manager.sendSerialized({
          type: "tickCommand",
          stream_id,
          command: {
            Reconfigure: { scenes },
          },
        })
      }
    },

    onIncomingMessage: (event) => {
      if (event.type === "orchestratorState") {
        const prevState = state
        const newState = event.state

        setState((prev) => ({
          ...newState,
          // Preserve local scenes if server doesn't send them
          scenes: newState.scenes.length > 0 ? newState.scenes : prev.scenes,
          total_duration:
            newState.total_duration > 0
              ? newState.total_duration
              : prev.total_duration,
        }))

        // Detect scene change for callback
        if (
          prevState.current_active_scene !== newState.current_active_scene &&
          previousSceneRef.current !== newState.current_active_scene
        ) {
          if (callbacksRef.current.onSceneChange) {
            callbacksRef.current.onSceneChange(
              previousSceneRef.current,
              newState.current_active_scene
            )
          }
          previousSceneRef.current = newState.current_active_scene
        }
      } else if (event.type === "error") {
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(event.message)
        }
      }
    },
  })

  // Reconfigure when scenes change (serialized)
  const previousScenesRef = useRef<string>("")
  useEffect(() => {
    if (!ws.isConnected || scenes.length === 0) return

    const scenesHash = JSON.stringify(scenes)
    if (scenesHash === previousScenesRef.current) return

    console.log("📝 Scenes changed, reconfiguring...")
    previousScenesRef.current = scenesHash

    ws.sendSerialized({
      type: "tickCommand",
      stream_id,
      command: {
        Reconfigure: { scenes },
      },
    }).catch((err) => {
      console.error("Failed to reconfigure:", err)
    })
  }, [scenes, ws.isConnected, stream_id, ws.sendSerialized])

  // Update local state when scenes prop changes
  useEffect(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setState((prev) => ({
      ...prev,
      scenes,
      total_duration: totalDuration,
      time_remaining: totalDuration - prev.current_time,
    }))
  }, [scenes])

  // --- Serialized Command Helpers ---
  const sendCommand = useCallback(
    (command: OrchestratorCommand) => {
      ws.sendSerialized({
        type: "tickCommand",
        stream_id,
        command,
      }).catch((err) => {
        console.error("Failed to send command:", err)
      })
    },
    [ws.sendSerialized, stream_id]
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

    // Raw
  }
}
