import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

// Orchestrator-specific schemas
export const SceneConfigSchema = z.object({
  sceneName: z.string(),
  duration: z.number().int().positive(),
})

export const OrchestratorStateSchema = z.object({
  isRunning: z.boolean(),
  currentActiveScene: z.string().nullable(),
  currentSceneIndex: z.number().int(),
  progress: z.number().min(0).max(1),
  currentTime: z.number().int().nonnegative(),
  timeRemaining: z.number().int().nonnegative(),
  activeElements: z.array(z.string()),
  scheduledElements: z.array(
    z.object({
      id: z.string(),
      sceneName: z.string(),
      startTime: z.number().int().nonnegative(),
      endTime: z.number().int().nonnegative().optional(),
      duration: z.number().int().positive(),
      isActive: z.boolean(),
    })
  ),
  scenes: z.array(SceneConfigSchema),
  totalDuration: z.number().int().nonnegative(),
  streamStatus: z.object({
    isStreaming: z.boolean(),
    streamTime: z.number().int().nonnegative(),
    timecode: z.string(),
  }),
})

export type SceneConfig = z.infer<typeof SceneConfigSchema>
export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>

export type OrchestratorConfig = {
  scenes: Array<SceneConfig>
  orchestratorUrl?: string
  autoStart?: boolean
  onSceneChange?: (fromScene: string | null, toScene: string | null) => void
  onStreamEnd?: () => void
  onError?: (error: string) => void
}

export function useOrchestrator(config: OrchestratorConfig) {
  const {
    scenes,
    autoStart = false,
    onSceneChange,
    onStreamEnd,
    onError,
  } = config

  const [isConnected, setIsConnected] = useState(true)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [currentState, setCurrentState] = useState<OrchestratorState>(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    return {
      isRunning: false,
      currentActiveScene: null,
      currentSceneIndex: 0,
      progress: 0,
      currentTime: 0,
      timeRemaining: totalDuration,
      activeElements: [],
      scheduledElements: generateScheduledElements(scenes),
      scenes,
      totalDuration,
      streamStatus: {
        isStreaming: false,
        streamTime: 0,
        timecode: "00:00:00.000",
      },
    }
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousSceneRef = useRef<string | null>(null)

  // Update scheduled elements when scenes change
  useEffect(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setCurrentState((prev) => ({
      ...prev,
      scenes,
      totalDuration,
      scheduledElements: generateScheduledElements(scenes),
      timeRemaining: totalDuration - prev.currentTime,
    }))
  }, [scenes])

  // Simulation loop
  useEffect(() => {
    if (!currentState.isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setCurrentState((prev) => {
        const newTime = prev.currentTime + 1
        const totalDuration = prev.totalDuration

        // Check if we've reached the end
        if (newTime >= totalDuration) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          return {
            ...prev,
            isRunning: false,
            currentTime: totalDuration,
            timeRemaining: 0,
            progress: 1,
            currentActiveScene: null,
          }
        }

        // Calculate current scene
        let cumulativeTime = 0
        let currentSceneIndex = 0
        let currentActiveScene: string | null = null

        for (let i = 0; i < prev.scenes.length; i++) {
          const scene = prev.scenes[i]
          if (
            newTime >= cumulativeTime &&
            newTime < cumulativeTime + scene.duration
          ) {
            currentSceneIndex = i
            currentActiveScene = scene.sceneName
            break
          }
          cumulativeTime += scene.duration
        }

        // Trigger scene change callback
        if (currentActiveScene !== previousSceneRef.current) {
          onSceneChange?.(previousSceneRef.current, currentActiveScene)
          previousSceneRef.current = currentActiveScene
        }

        // Update scheduled elements
        const updatedElements = prev.scheduledElements.map((el) => ({
          ...el,
          isActive:
            newTime >= el.startTime && (!el.endTime || newTime < el.endTime),
        }))

        return {
          ...prev,
          currentTime: newTime,
          timeRemaining: totalDuration - newTime,
          progress: newTime / totalDuration,
          currentSceneIndex,
          currentActiveScene,
          scheduledElements: updatedElements,
          activeElements: updatedElements
            .filter((el) => el.isActive)
            .map((el) => el.id),
        }
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [currentState.isRunning, onSceneChange])

  const startOrchestrator = useCallback(() => {
    setCurrentState((prev) => ({
      ...prev,
      isRunning: true,
      streamStatus: { ...prev.streamStatus, isStreaming: true },
    }))
  }, [])

  const stopOrchestrator = useCallback(() => {
    setCurrentState((prev) => ({
      ...prev,
      isRunning: false,
      streamStatus: { ...prev.streamStatus, isStreaming: false },
    }))
    previousSceneRef.current = null
  }, [])

  const resetOrchestrator = useCallback(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    setCurrentState((prev) => ({
      ...prev,
      isRunning: false,
      currentActiveScene: null,
      currentSceneIndex: 0,
      progress: 0,
      currentTime: 0,
      timeRemaining: totalDuration,
      activeElements: [],
      scheduledElements: generateScheduledElements(scenes),
    }))
    previousSceneRef.current = null
  }, [scenes])

  const pauseOrchestrator = useCallback(() => {
    setCurrentState((prev) => ({ ...prev, isRunning: false }))
  }, [])

  const resumeOrchestrator = useCallback(() => {
    setCurrentState((prev) => ({ ...prev, isRunning: true }))
  }, [])

  const forceScene = useCallback(
    (sceneName: string) => {
      const sceneIndex = scenes.findIndex((s) => s.sceneName === sceneName)
      if (sceneIndex === -1) return

      let cumulativeTime = 0
      for (let i = 0; i < sceneIndex; i++) {
        cumulativeTime += scenes[i].duration
      }

      setCurrentState((prev) => ({
        ...prev,
        currentSceneIndex: sceneIndex,
        currentActiveScene: sceneName,
        currentTime: cumulativeTime,
        progress: cumulativeTime / prev.totalDuration,
        timeRemaining: prev.totalDuration - cumulativeTime,
      }))

      previousSceneRef.current = sceneName
    },
    [scenes]
  )

  const skipCurrentScene = useCallback(() => {
    setCurrentState((prev) => {
      const nextSceneIndex = prev.currentSceneIndex + 1
      if (nextSceneIndex >= prev.scenes.length) return prev

      let cumulativeTime = 0
      for (let i = 0; i <= nextSceneIndex; i++) {
        if (i < nextSceneIndex) {
          cumulativeTime += prev.scenes[i].duration
        }
      }

      return {
        ...prev,
        currentSceneIndex: nextSceneIndex,
        currentActiveScene: prev.scenes[nextSceneIndex].sceneName,
        currentTime: cumulativeTime,
        progress: cumulativeTime / prev.totalDuration,
        timeRemaining: prev.totalDuration - cumulativeTime,
      }
    })
  }, [])

  const updateStreamStatus = useCallback(
    (isStreaming: boolean, streamTime: number, timecode: string) => {
      setCurrentState((prev) => ({
        ...prev,
        streamStatus: { isStreaming, streamTime, timecode },
      }))
    },
    []
  )

  return {
    // Connection state
    isConnected,
    isReconnecting,
    error,

    // Orchestrator state (from server)
    state: currentState,
    isRunning: currentState.isRunning,
    currentActiveScene: currentState.currentActiveScene,
    progress: currentState.progress,
    currentTime: currentState.currentTime,
    timeRemaining: currentState.timeRemaining,
    activeElements: currentState.activeElements,
    scheduledElements: currentState.scheduledElements,

    // Stream status from orchestrator's perspective
    streamStatus: currentState.streamStatus,

    // Control functions
    start: startOrchestrator,
    stop: stopOrchestrator,
    reset: resetOrchestrator,
    pause: pauseOrchestrator,
    resume: resumeOrchestrator,
    forceScene,
    skipCurrentScene,
    updateStreamStatus,

    // Configuration
    scenes,
    totalDuration: currentState.totalDuration,
  }
}

// Helper function to generate mock scheduled elements
function generateScheduledElements(scenes: SceneConfig[]) {
  const elements: OrchestratorState["scheduledElements"] = []
  let cumulativeTime = 0

  scenes.forEach((scene, index) => {
    elements.push({
      id: `element-${index + 1}`,
      sceneName: scene.sceneName,
      startTime: cumulativeTime,
      endTime: cumulativeTime + scene.duration,
      duration: scene.duration,
      isActive: false,
    })
    cumulativeTime += scene.duration
  })

  return elements
}
