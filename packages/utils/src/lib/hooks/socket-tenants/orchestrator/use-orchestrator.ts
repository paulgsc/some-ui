import { useCallback, useEffect, useRef } from "react"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"
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

export const OrchestratorCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("configure"),
    scenes: z.array(SceneConfigSchema),
  }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({
    type: z.literal("forceScene"),
    sceneName: z.string(),
  }),
  z.object({ type: z.literal("skipCurrentScene") }),
  z.object({
    type: z.literal("updateStreamStatus"),
    isStreaming: z.boolean(),
    streamTime: z.number().int().nonnegative(),
    timecode: z.string(),
  }),
])

export const OrchestratorEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stateUpdate"),
    state: OrchestratorStateSchema,
  }),
  z.object({
    type: z.literal("sceneChange"),
    fromScene: z.string().nullable(),
    toScene: z.string().nullable(),
    timestamp: z.number().int(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
  z.object({
    type: z.literal("configured"),
    scenes: z.array(SceneConfigSchema),
    totalDuration: z.number().int(),
  }),
])

// WebSocket message schemas
export const OutgoingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("command"),
    cmd: OrchestratorCommandSchema,
  }),
  z.object({
    type: z.literal("subscribe"),
    events: z.array(z.string()).optional(),
  }),
])

export type SceneConfig = z.infer<typeof SceneConfigSchema>
export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>
export type OrchestratorCommand = z.infer<typeof OrchestratorCommandSchema>
export type OrchestratorEvent = z.infer<typeof OrchestratorEventSchema>
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

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
    orchestratorUrl,
    autoStart = true,
    onSceneChange,
    onStreamEnd,
    onError,
  } = config

  const previousActiveSceneRef = useRef<string | null>(null)
  const configuredRef = useRef(false)

  // Orchestrator WebSocket connection
  const orchestrator = useWebSocketQuery<OrchestratorEvent, OutgoingMessage>({
    url:
      orchestratorUrl ||
      `ws://${window.location.hostname}:${3001}/orchestrator`,
    queryKey: ["orchestrator_socket"],
    incomingMessageSchema: OrchestratorEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: true,
    onIncomingMessage: (event) => {
      if (event.type === "sceneChange" && onSceneChange) {
        onSceneChange(event.fromScene, event.toScene)
      } else if (event.type === "error" && onError) {
        onError(event.message)
      }
    },
  })

  // Get current state from messages
  const currentState = orchestrator.messages.find(
    (msg): msg is Extract<OrchestratorEvent, { type: "stateUpdate" }> =>
      msg.type === "stateUpdate"
  )?.state

  // Subscribe and configure when connected
  useEffect(() => {
    if (!orchestrator.isConnected || configuredRef.current) return

    // Subscribe to events
    orchestrator.sendMessage({
      type: "subscribe",
      events: ["stateUpdate", "sceneChange", "error"],
    })

    // Configure scenes
    if (scenes.length > 0) {
      orchestrator.sendMessage({
        type: "command",
        cmd: {
          type: "configure",
          scenes,
        },
      })
      configuredRef.current = true
    }
  }, [orchestrator.isConnected, scenes, orchestrator])

  // Reset configuration flag on disconnect
  useEffect(() => {
    if (!orchestrator.isConnected) {
      configuredRef.current = false
    }
  }, [orchestrator.isConnected])

  // Control functions
  const startOrchestrator = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "start" },
    })
  }, [orchestrator])

  const stopOrchestrator = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "stop" },
    })
  }, [orchestrator])

  const resetOrchestrator = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "reset" },
    })
    configuredRef.current = false
  }, [orchestrator])

  const pauseOrchestrator = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "pause" },
    })
  }, [orchestrator])

  const resumeOrchestrator = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "resume" },
    })
  }, [orchestrator])

  const forceScene = useCallback(
    (sceneName: string) => {
      orchestrator.sendMessage({
        type: "command",
        cmd: {
          type: "forceScene",
          sceneName,
        },
      })
    },
    [orchestrator]
  )

  const skipCurrentScene = useCallback(() => {
    orchestrator.sendMessage({
      type: "command",
      cmd: { type: "skipCurrentScene" },
    })
  }, [orchestrator])

  // Update stream status (called from OBS hook)
  const updateStreamStatus = useCallback(
    (isStreaming: boolean, streamTime: number, timecode: string) => {
      orchestrator.sendMessage({
        type: "command",
        cmd: {
          type: "updateStreamStatus",
          isStreaming,
          streamTime,
          timecode,
        },
      })

      // Auto-start/stop based on streaming state
      if (autoStart && currentState) {
        if (isStreaming && !currentState.isRunning) {
          startOrchestrator()
        } else if (!isStreaming && currentState.isRunning) {
          stopOrchestrator()
          if (onStreamEnd) {
            onStreamEnd()
          }
        }
      }
    },
    [
      orchestrator,
      autoStart,
      currentState,
      startOrchestrator,
      stopOrchestrator,
      onStreamEnd,
    ]
  )

  return {
    // Connection state
    isConnected: orchestrator.isConnected,
    isReconnecting: orchestrator.isReconnecting,
    error: orchestrator.error,

    // Orchestrator state (from server)
    state: currentState,
    isRunning: currentState?.isRunning || false,
    currentActiveScene: currentState?.currentActiveScene || null,
    progress: currentState?.progress || 0,
    currentTime: currentState?.currentTime || 0,
    timeRemaining: currentState?.timeRemaining || 0,
    activeElements: currentState?.activeElements || [],
    scheduledElements: currentState?.scheduledElements || [],

    // Stream status from orchestrator's perspective
    streamStatus: currentState?.streamStatus || {
      isStreaming: false,
      streamTime: 0,
      timecode: "00:00:00.000",
    },

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
    totalDuration: currentState?.totalDuration || 0,

    // Raw WebSocket access
    rawSocket: orchestrator,
  }
}
