import { useCallback, useEffect, useRef, useState } from "react"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"
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
import type { z } from "zod"

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
  isReconnecting: boolean
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

  // Raw access
  parseErrors: Array<z.ZodError>
  rawSocket: ReturnType<
    typeof useWebSocketQuery<IncomingOrchestratorEvent, OutgoingMessage>
  >
}

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

  const configuredRef = useRef(false)
  const previousSceneRef = useRef<string | null>(null)
  const lastConfiguredScenesRef = useRef<string>("")

  const ws = useWebSocketQuery<IncomingOrchestratorEvent, OutgoingMessage>({
    url: orchestratorUrl || `ws://${window.location.hostname}:3000/ws`,
    queryKey: ["orchestrator"],
    incomingMessageSchema: IncomingOrchestratorEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: true,
    onIncomingMessage: (event) => {
      if (event.type === "orchestratorState") {
        const prevState = state
        const newState = event.state
        setState((prev) => ({
          ...newState,
          // Preserve local scenes if server doesn't send them
          scenes: newState.scenes.length > 0 ? newState.scenes : prev.scenes,
          totalDuration:
            newState.total_duration > 0
              ? newState.total_duration
              : prev.total_duration,
        }))

        // Detect scene change for callback
        if (
          prevState.current_active_scene !== newState.current_active_scene &&
          previousSceneRef.current !== newState.current_active_scene
        ) {
          if (onSceneChange)
            onSceneChange(
              previousSceneRef.current,
              newState.current_active_scene
            )
          previousSceneRef.current = newState.current_active_scene
        }
      } else if (event.type === "error") {
        if (onError) onError(event.message)
      }
    },
  })

  // Helper to check if scenes actually changed
  const haveScenesChanged = useCallback((newScenes: Array<SceneConfig>) => {
    const newHash = JSON.stringify(newScenes)
    if (newHash === lastConfiguredScenesRef.current) {
      return false
    }
    lastConfiguredScenesRef.current = newHash
    return true
  }, [])

  // Auto configure & subscribe on connect (only once per connection)
  useEffect(() => {
    if (!ws.isConnected || configuredRef.current) return

    console.log("Initial configuration on connect")

    // Subscribe
    ws.sendMessage({
      type: "subscribe",
      event_types: ["orchestratorState"],
    })

    // Configure if scenes provided
    if (scenes.length > 0) {
      ws.sendMessage({
        type: "tickCommand",
        stream_id,
        command: {
          Reconfigure: {
            scenes: scenes,
          },
        },
      })
      lastConfiguredScenesRef.current = JSON.stringify(scenes)
      configuredRef.current = true
    }
  }, [ws.isConnected, stream_id, ws.sendMessage]) // ✅ Don't include scenes here

  // Reset config flag on disconnect
  useEffect(() => {
    if (!ws.isConnected) {
      configuredRef.current = false
      previousSceneRef.current = null
      lastConfiguredScenesRef.current = ""
    }
  }, [ws.isConnected])

  // Reconfigure when scenes actually change (deep comparison)
  useEffect(() => {
    if (!ws.isConnected || !configuredRef.current || scenes.length === 0) {
      return
    }

    // Only reconfigure if scenes actually changed
    if (haveScenesChanged(scenes)) {
      console.log("Scenes changed, sending reconfigure")
      ws.sendMessage({
        type: "tickCommand",
        stream_id,
        command: {
          Reconfigure: {
            scenes: scenes,
          },
        },
      })
    }
  }, [scenes, ws.isConnected, stream_id, ws.sendMessage, haveScenesChanged])

  // Update local state when scenes prop changes
  useEffect(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setState((prev) => ({
      ...prev,
      scenes,
      totalDuration,
      time_remaining: totalDuration - prev.current_time,
    }))
  }, [scenes])

  // --- Action Helpers ---
  const sendCommand = useCallback(
    (command: OrchestratorCommand) => {
      ws.sendMessage({ type: "tickCommand", stream_id, command })
    },
    [ws.sendMessage, stream_id]
  )

  const start = useCallback(
    () => sendCommand({ Start: { scenes: scenes } }),
    [sendCommand, scenes]
  )

  const stop = useCallback(() => {
    sendCommand({ Stop: null })
    previousSceneRef.current = null
  }, [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ Reset: null })
    configuredRef.current = false
    previousSceneRef.current = null
    lastConfiguredScenesRef.current = ""
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
          if (onStreamEnd) onStreamEnd()
        }
      }
    },
    [sendCommand, autoStart, start, stop, onStreamEnd]
  )

  return {
    // WebSocket state
    isConnected: ws.isConnected,
    isReconnecting: ws.isConnecting,
    error: ws.error,

    // Orchestrator state
    state,

    // Actions
    start,
    stop,
    reset,
    pause,
    resume,
    forceScene,
    skipCurrentScene,
    updateStreamStatus,

    // Raw
    parseErrors: ws.parseErrors,
    rawSocket: ws,
  }
}
