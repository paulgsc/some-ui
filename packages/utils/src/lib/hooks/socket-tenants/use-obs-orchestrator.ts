import { useEffect, useMemo, useRef } from "react"
import {
  createLivestreamOrchestrator,
  createStore,
  useLivestreamOrchestrator,
} from "@utils/lib/context/ochestra"

import { useObsStatusWebSocket } from "./use-obs-socket" // Your OBS hook

export type SceneConfig = {
  sceneName: string
  duration: number // Duration in milliseconds
}

export type OrchestratorConfig = {
  scenes: Array<SceneConfig> // [intro, scene1, scene2, ..., outro]
  obsWebSocketUrl?: string
  autoStart?: boolean // Auto-start when OBS starts streaming
  onSceneChange?: (sceneName: string, isActive: boolean) => void
  onStreamEnd?: () => void
}

function sceneToUIElement(scene: SceneConfig, index: number) {
  return {
    id: `scene_${scene.sceneName}`,
    component: null, // Use null instead of () => null for ReactNode compatibility
    duration: scene.duration,
    data: { sceneName: scene.sceneName, index },
  }
}

// Parse OBS timecode to milliseconds
function parseTimecode(timecode: string): number {
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

export function useObsOrchestrator(config: OrchestratorConfig) {
  const {
    scenes,
    obsWebSocketUrl,
    autoStart = true,
    onSceneChange,
    onStreamEnd,
  } = config

  // OBS WebSocket connection
  const obs = useObsStatusWebSocket({
    url: obsWebSocketUrl || `ws://${window.location.hostname}:${3000}/ws`, // Provide fallback empty string
    queryKey: ["obs_socket"],
    debugMode: true,
  })

  // Create orchestrator with your store
  const orchestrator = useMemo(() => {
    // You'll need to import your createStore function here
    return createLivestreamOrchestrator(createStore)
  }, [])

  // Hook for the orchestrator state
  const orchestratorState = useLivestreamOrchestrator(orchestrator)

  // Refs for tracking state
  const wasStreamingRef = useRef(false)
  const streamStartTimeRef = useRef<number | null>(null)
  const currentSceneRef = useRef<string | null>(null)

  // Setup scene schedule when config changes
  useEffect(() => {
    if (scenes.length === 0) return

    orchestrator.reset()

    // Calculate total duration
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    orchestrator.setDuration(totalDuration)

    // Schedule all scenes
    let accumulatedTime = 0
    scenes.forEach((scene, index) => {
      const element = sceneToUIElement(scene, index)

      if (index === 0) {
        // First scene is intro - starts immediately
        orchestrator.scheduleUI(element, 0, scene.duration)
      } else if (index === scenes.length - 1) {
        // Last scene is outro - handled automatically by orchestrator
        // But we can schedule it explicitly too
        orchestrator.scheduleUI(element, accumulatedTime)
      } else {
        // Regular scenes
        orchestrator.scheduleUI(
          element,
          accumulatedTime,
          accumulatedTime + scene.duration
        )
      }

      accumulatedTime += scene.duration
    })
  }, [scenes, orchestrator])

  // Handle OBS streaming state changes
  useEffect(() => {
    const isStreamingNow = obs.status.streaming
    const wasStreaming = wasStreamingRef.current

    if (isStreamingNow && !wasStreaming && autoStart) {
      // Stream just started
      const startTime = Date.now()
      streamStartTimeRef.current = startTime

      const introScene = scenes[0]
      if (introScene) {
        orchestrator.startStream(sceneToUIElement(introScene, 0))
        if (onSceneChange) {
          onSceneChange(introScene.sceneName, true)
        }
      }
    } else if (!isStreamingNow && wasStreaming) {
      // Stream just stopped
      const outroScene = scenes[scenes.length - 1]
      if (outroScene) {
        orchestrator.endStream(sceneToUIElement(outroScene, scenes.length - 1))
      }

      if (onStreamEnd) {
        onStreamEnd()
      }

      streamStartTimeRef.current = null
    }

    wasStreamingRef.current = isStreamingNow
  }, [
    obs.status.streaming,
    autoStart,
    scenes,
    orchestrator,
    onSceneChange,
    onStreamEnd,
  ])

  // Update orchestrator time from OBS timecode
  useEffect(() => {
    if (!obs.status.streaming || !streamStartTimeRef.current) return

    const timecodeMs = parseTimecode(
      obs.status.streamTimecode || "00:00:00.000"
    )
    const currentTime = streamStartTimeRef.current + timecodeMs

    orchestrator.updateTime(currentTime)
  }, [obs.status.streamTimecode, obs.status.streaming, orchestrator])

  // Handle scene changes based on active elements
  useEffect(() => {
    const activeElements = orchestratorState.activeElements

    // Find the currently active scene
    let activeScene: string | null = null

    for (const elementId of activeElements) {
      const sceneIndex = scenes.findIndex(
        (s) => `scene_${s.sceneName}` === elementId
      )
      if (sceneIndex !== -1) {
        activeScene = scenes[sceneIndex].sceneName
        break
      }
    }

    // If scene changed, notify and switch OBS scene
    if (activeScene !== currentSceneRef.current) {
      const previousScene = currentSceneRef.current
      currentSceneRef.current = activeScene

      if (previousScene && onSceneChange) {
        onSceneChange(previousScene, false)
      }

      if (activeScene) {
        // Switch OBS to the active scene
        obs.setScene(activeScene)

        if (onSceneChange) {
          onSceneChange(activeScene, true)
        }
      }
    }
  }, [orchestratorState.activeElements, scenes, obs, onSceneChange])

  return {
    // OBS controls
    obs,

    // Orchestrator state
    ...orchestratorState,

    // Scene management
    currentActiveScene: currentSceneRef.current,
    sceneProgress: orchestratorState.progress,

    // Manual controls
    forceScene: (sceneName: string) => {
      const sceneIndex = scenes.findIndex((s) => s.sceneName === sceneName)
      if (sceneIndex !== -1) {
        const elementId = `scene_${sceneName}`
        orchestrator.showUI(elementId)
        obs.setScene(sceneName)
      }
    },

    skipCurrentScene: () => {
      const currentScene = currentSceneRef.current
      if (currentScene) {
        const elementId = `scene_${currentScene}`
        orchestrator.hideUI(elementId)
      }
    },

    // Stream controls (delegates to OBS)
    startStream: obs.startStreaming,
    stopStream: obs.stopStreaming,

    // Config
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
  }
}
