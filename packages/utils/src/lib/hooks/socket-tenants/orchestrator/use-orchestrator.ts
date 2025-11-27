import { useCallback, useEffect, useRef, useState } from "react"
import type {
  IncomingOrchestratorEvent,
  OrchestratorCommand,
  OrchestratorState,
  OutgoingMessage,
  SceneConfig,
} from "@/schemas/orchestrator-schemas"
import {
  defaultOrchestratorState,
  IncomingOrchestratorEventSchema,
  OutgoingMessageSchema,
} from "@/schemas/orchestrator-schemas"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"

// adjust path

export type UseOrchestratorConfig = {
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
  error: Error | null

  // Derived state
  isRunning: boolean
  currentActiveScene: string | null
  progress: number
  currentTime: number
  timeRemaining: number
  activeElements: Array<string>
  scheduledElements: typeof defaultOrchestratorState.scheduled_elements
  streamStatus: typeof defaultOrchestratorState.stream_status
  totalDuration: number

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
  rawSocket: ReturnType<
    typeof useWebSocketQuery<IncomingOrchestratorEvent, OutgoingMessage>
  >
}

export function useOrchestrator({
  scenes,
  orchestratorUrl,
  autoStart = true,
  onSceneChange,
  onStreamEnd,
  onError,
}: UseOrchestratorConfig): UseOrchestratorReturn {
  const [state, setState] = useState<OrchestratorState>(
    defaultOrchestratorState
  )
  const configuredRef = useRef(false)
  const previousSceneRef = useRef<string | null>(null)

  const ws = useWebSocketQuery<OrchestratorEvent, OutgoingMessage>({
    url:
      orchestratorUrl || `ws://${window.location.hostname}:3001/orchestrator`,
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
        setState(newState)

        // Detect scene change for callback
        if (prevState.currentActiveScene !== newState.currentActiveScene) {
          onSceneChange?.(
            prevState.currentActiveScene,
            newState.currentActiveScene
          )
        }
      } else if (event.type === "error") {
        onError?.(event.message)
      }
    },
  })

  // Auto configure & subscribe on connect
  useEffect(() => {
    if (!ws.isConnected || configuredRef.current) return

    // Subscribe
    ws.sendMessage({
      type: "subscribe",
      event_types: ["stateUpdate", "sceneChange", "error"],
    })

    // Configure if scenes provided
    if (scenes.length > 0) {
      ws.sendMessage({
        type: "command",
        cmd: {
          type: "Reconfigure",
          config: {
            scenes,
          },
        },
      })
      configuredRef.current = true
    }
  }, [ws.isConnected, scenes, ws])

  // Reset config flag on disconnect
  useEffect(() => {
    if (!ws.isConnected) {
      configuredRef.current = false
    }
  }, [ws.isConnected])

  // --- Action Helpers ---
  const sendCommand = useCallback(
    (cmd: OrchestratorCommand) => {
      ws.sendMessage({ type: "command", cmd })
    },
    [ws]
  )

  const start = useCallback(() => sendCommand({ type: "Start" }), [sendCommand])
  const stop = useCallback(() => sendCommand({ type: "Stop" }), [sendCommand])
  const reset = useCallback(() => {
    sendCommand({ type: "Reset" })
    configuredRef.current = false
  }, [sendCommand])
  const pause = useCallback(() => sendCommand({ type: "Pause" }), [sendCommand])
  const resume = useCallback(
    () => sendCommand({ type: "Resume" }),
    [sendCommand]
  )
  const forceScene = useCallback(
    (scene: string) => sendCommand({ type: "ForceScene", scene }),
    [sendCommand]
  )
  const skipCurrentScene = useCallback(
    () => sendCommand({ type: "SkipCurrentScene" }),
    [sendCommand]
  )

  const updateStreamStatus = useCallback(
    (isStreaming: boolean, streamTime: number, timecode: string) => {
      sendCommand({
        type: "UpdateStreamStatus",
        is_streaming: isStreaming,
        stream_time: streamTime,
        timecode,
      })

      if (autoStart) {
        if (isStreaming && !state.is_running) {
          start()
        } else if (!isStreaming && state.is_running) {
          stop()
          onStreamEnd()
        }
      }
    },
    [sendCommand, autoStart, state.is_running, start, stop, onStreamEnd]
  )

  return {
    // WebSocket state
    isConnected: ws.isConnected,
    isReconnecting: ws.isReconnecting,
    error: ws.error,

    // Orchestrator state
    state,
    isRunning: state.is_running,
    currentActiveScene: state.current_active_scene,
    progress: state.progress,
    currentTime: state.current_time,
    timeRemaining: state.time_remaining,
    activeElements: state.active_elements,
    scheduledElements: state.scheduled_elements,
    streamStatus: state.stream_status,
    totalDuration: state.total_duration,

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
    rawSocket: ws,
  }
}
