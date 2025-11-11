import { useEffect, useRef } from "react"

import { useObsStatusWebSocket } from "./use-obs-socket"
import {
  useOrchestrator,
  type OrchestratorConfig,
  type SceneConfig,
} from "./use-orchestrator"

export type CombinedStreamConfig = {
  scenes: Array<SceneConfig>
  obsWebSocketUrl?: string
  orchestratorUrl?: string
  autoStart?: boolean
  syncOBSScenes?: boolean // Whether to automatically switch OBS scenes
  onSceneChange?: (fromScene: string | null, toScene: string | null) => void
  onStreamEnd?: () => void
  onError?: (source: "obs" | "orchestrator", error: string) => void
}

export function useStreamOrchestrator(config: CombinedStreamConfig) {
  const {
    scenes,
    obsWebSocketUrl,
    orchestratorUrl,
    autoStart = true,
    syncOBSScenes = true,
    onSceneChange,
    onStreamEnd,
    onError,
  } = config

  const previousOBSStreamingRef = useRef(false)
  const previousOrchestratorSceneRef = useRef<string | null>(null)

  // OBS WebSocket connection
  const obs = useObsStatusWebSocket({
    url: obsWebSocketUrl || `ws://${window.location.hostname}:${3000}/obs`,
    queryKey: ["obs_socket"],
    debugMode: true,
    onError: (error) => {
      if (onError) onError("obs", error.message)
    },
  })

  // Orchestrator connection
  const orchestrator = useOrchestrator({
    scenes,
    orchestratorUrl,
    autoStart,
    onSceneChange,
    onStreamEnd,
    onError: (error) => {
      if (onError) onError("orchestrator", error)
    },
  })

  // Sync OBS streaming state to orchestrator
  useEffect(() => {
    const isStreamingNow = obs.status.streaming
    const wasStreaming = previousOBSStreamingRef.current

    // Parse timecode to milliseconds for orchestrator
    const parseTimecode = (timecode: string): number => {
      try {
        const parts = timecode.split(":")
        if (parts.length !== 3) return 0

        const [hours, minutes, secondsPart] = parts
        const [seconds, milliseconds] = secondsPart.split(".")

        return (
          parseInt(hours) * 60 * 60 * 1000 +
          parseInt(minutes) * 60 * 1000 +
          parseInt(seconds) * 1000 +
          (milliseconds ? parseInt(milliseconds.padEnd(3, "0")) : 0)
        )
      } catch {
        return 0
      }
    }

    const streamTime = parseTimecode(
      obs.status.streamTimecode || "00:00:00.000"
    )

    // Update orchestrator with current stream status
    orchestrator.updateStreamStatus(
      isStreamingNow,
      streamTime,
      obs.status.streamTimecode || "00:00:00.000"
    )

    previousOBSStreamingRef.current = isStreamingNow
  }, [obs.status.streaming, obs.status.streamTimecode, orchestrator])

  // Sync orchestrator scene changes to OBS
  useEffect(() => {
    const currentOrchestratorScene = orchestrator.currentActiveScene
    const previousScene = previousOrchestratorSceneRef.current

    if (
      syncOBSScenes &&
      currentOrchestratorScene &&
      currentOrchestratorScene !== previousScene &&
      obs.isConnected
    ) {
      // Switch OBS to the orchestrator's active scene
      obs.setScene(currentOrchestratorScene)
    }

    previousOrchestratorSceneRef.current = currentOrchestratorScene
  }, [orchestrator.currentActiveScene, syncOBSScenes, obs])

  // Combined error state
  const hasError = obs.error || orchestrator.error
  const isFullyConnected = obs.isConnected && orchestrator.isConnected

  return {
    // Connection states
    obs: {
      isConnected: obs.isConnected,
      isReconnecting: obs.isReconnecting,
      error: obs.error,
    },
    orchestrator: {
      isConnected: orchestrator.isConnected,
      isReconnecting: orchestrator.isReconnecting,
      error: orchestrator.error,
    },
    isFullyConnected,
    hasError,

    // OBS status and controls
    obsStatus: obs.status,
    startStream: obs.startStreaming,
    stopStream: obs.stopStreaming,
    startRecording: obs.startRecording,
    stopRecording: obs.stopRecording,
    setOBSScene: obs.setScene,

    // Orchestrator state and controls
    orchestratorState: orchestrator.state,
    isRunning: orchestrator.isRunning,
    currentActiveScene: orchestrator.currentActiveScene,
    progress: orchestrator.progress,
    currentTime: orchestrator.currentTime,
    timeRemaining: orchestrator.timeRemaining,
    activeElements: orchestrator.activeElements,
    scheduledElements: orchestrator.scheduledElements,

    // Orchestrator controls
    start: orchestrator.start,
    stop: orchestrator.stop,
    reset: orchestrator.reset,
    pause: orchestrator.pause,
    resume: orchestrator.resume,
    forceScene: orchestrator.forceScene,
    skipCurrentScene: orchestrator.skipCurrentScene,

    // Configuration
    scenes,
    totalDuration: orchestrator.totalDuration,

    // Sync control
    enableOBSSync: () => {
      // Re-enable syncing if disabled
      config.syncOBSScenes = true
    },
    disableOBSSync: () => {
      // Disable automatic OBS scene switching
      config.syncOBSScenes = false
    },

    // Raw socket access for advanced usage
    rawOBS: obs,
    rawOrchestrator: orchestrator.rawSocket,
  }
}
