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

export type UseOrchestratorConfig = {
  streamId: string
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

  // Derived state
  isRunning: boolean
  currentActiveScene: string | null
  progress: number
  currentTime: number
  timeRemaining: number
  activeElements: Array<string>
  scheduledElements: typeof defaultOrchestratorState.scheduledElements
  streamStatus: typeof defaultOrchestratorState.streamStatus
  totalDuration: number
  scenes: Array<SceneConfig>

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
  streamId,
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
    totalDuration: initialTotalDuration,
    timeRemaining: initialTotalDuration,
  })

  const [localScenes, setLocalScenes] = useState<Array<SceneConfig>>(scenes)
  const configuredRef = useRef(false)
  const previousSceneRef = useRef<string | null>(null)

  // Update local scenes and recalculate duration when scenes prop changes
  useEffect(() => {
    setLocalScenes(scenes)
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setState((prev) => ({
      ...prev,
      scenes,
      totalDuration,
      timeRemaining: totalDuration - prev.currentTime,
    }))
  }, [scenes])

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
        console.log("new event state recv: ", newState)
        setState((prev) => ({
          ...newState,
          // Preserve local scenes if server doesn't send them
          scenes: newState.scenes.length > 0 ? newState.scenes : prev.scenes,
          totalDuration:
            newState.totalDuration > 0
              ? newState.totalDuration
              : prev.totalDuration,
        }))

        // Detect scene change for callback
        if (
          prevState.currentActiveScene !== newState.currentActiveScene &&
          previousSceneRef.current !== newState.currentActiveScene
        ) {
          if (onSceneChange)
            onSceneChange(previousSceneRef.current, newState.currentActiveScene)
          previousSceneRef.current = newState.currentActiveScene
        }
      } else if (event.type === "error") {
        if (onError) onError(event.message)
      }
    },
  })

  // Auto configure & subscribe on connect
  useEffect(() => {
    if (!ws.isConnected || configuredRef.current) return

    // Subscribe
    ws.sendMessage({
      type: "subscribe",
      event_types: ["orchestratorState"],
    })

    // Configure if scenes provided
    if (localScenes.length > 0) {
      ws.sendMessage({
        type: "tickCommand",
        streamId,
        command: {
          Reconfigure: {
            scenes: localScenes,
          },
        },
      })
      configuredRef.current = true
    }
  }, [ws.isConnected, localScenes, ws])

  // Reset config flag on disconnect
  useEffect(() => {
    if (!ws.isConnected) {
      configuredRef.current = false
      previousSceneRef.current = null
    }
  }, [ws.isConnected])

  // Reconfigure when scenes change and connected
  useEffect(() => {
    if (ws.isConnected && configuredRef.current && localScenes.length > 0) {
      ws.sendMessage({
        type: "tickCommand",
        streamId,
        command: {
          Reconfigure: {
            scenes: localScenes,
          },
        },
      })
    }
  }, [localScenes, ws.isConnected, ws])

  // --- Action Helpers ---
  const sendCommand = useCallback(
    (command: OrchestratorCommand) => {
      ws.sendMessage({ type: "tickCommand", streamId, command })
    },
    [ws]
  )

  const start = useCallback(
    () => sendCommand({ Start: { scenes: localScenes } }),
    [sendCommand]
  )

  const stop = useCallback(() => {
    sendCommand({ Stop: null })
    previousSceneRef.current = null
  }, [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ Reset: null })
    configuredRef.current = false
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
    (isStreaming: boolean, streamTime: number, timecode: string) => {
      sendCommand({
        UpdateStreamStatus: {
          isStreaming: isStreaming,
          streamTime: streamTime,
          timecode,
        },
      })

      // Auto-start/stop based on stream status
      if (autoStart) {
        if (isStreaming && !state.isRunning) {
          start()
        } else if (!isStreaming && state.isRunning) {
          stop()
          if (onStreamEnd) onStreamEnd()
        }
      }
    },
    [sendCommand, autoStart, state.isRunning, start, stop, onStreamEnd]
  )

  return {
    // WebSocket state
    isConnected: ws.isConnected,
    isReconnecting: ws.isConnecting,
    error: ws.error,

    // Orchestrator state
    state,
    isRunning: state.isRunning,
    currentActiveScene: state.currentActiveScene,
    progress: state.progress,
    currentTime: state.currentTime,
    timeRemaining: state.timeRemaining,
    activeElements: state.activeElements,
    scheduledElements: state.scheduledElements,
    streamStatus: state.streamStatus,
    totalDuration: state.totalDuration,
    scenes: state.scenes,

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
