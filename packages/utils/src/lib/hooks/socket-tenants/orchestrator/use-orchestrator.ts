import { useCallback, useEffect, useRef } from "react"
import { useOrchestratorStore } from "@utils/lib/context/zustand-store"
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
  IncomingOrchestratorEventSchema,
  OutgoingMessageSchema,
} from "some-types-utils"

export type UseOrchestratorConfig = {
  stream_id: string
  scenes: Array<SceneConfig>
  orchestratorUrl?: string
  onSceneChange?: (fromScene: string | null, toScene: string | null) => void
  onStreamEnd?: () => void
  onError?: (error: string) => void
}

/**
 * Orchestrator hook - SINGLETON WebSocket connection manager
 *
 * ⚠️  ONLY call this ONCE at app root level
 *
 * Responsibilities:
 * - Establish WebSocket connection (singleton)
 * - Wire protocol layer to Zustand store
 * - Broadcast state updates to store
 * - Fire global callbacks (scene changes, errors)
 *
 * Components should NOT call this hook.
 * Instead, they should:
 * - Read state via selectors: useOrchestratorStore(selectCurrentScene)
 * - Dispatch commands via store actions: useOrchestratorStore.getState().start()
 */
export function useOrchestrator({
  stream_id,
  scenes,
  orchestratorUrl,
  onSceneChange,
  onStreamEnd,
  onError,
}: UseOrchestratorConfig): void {
  // Store setters (internal only)
  const _setState = useOrchestratorStore((s) => s._setState)
  const _setConnectionStatus = useOrchestratorStore(
    (s) => s._setConnectionStatus
  )
  const _setError = useOrchestratorStore((s) => s._setError)
  const _setCommandSender = useOrchestratorStore((s) => s._setCommandSender)

  // Track previous scene for change detection
  const previousSceneRef = useRef<string | null>(null)

  // Stable callback refs
  const callbacksRef = useRef({ onSceneChange, onStreamEnd, onError })
  useEffect(() => {
    callbacksRef.current = { onSceneChange, onStreamEnd, onError }
  }, [onSceneChange, onStreamEnd, onError])

  // Stable config ref
  const configRef = useRef({ stream_id, scenes })
  useEffect(() => {
    configRef.current = { stream_id, scenes }
  }, [stream_id, scenes])

  // Stable WebSocket init
  const init = useCallback(async (manager: WebSocketManager) => {
    console.log("🚀 Orchestrator init (singleton)")

    // Subscribe to state updates
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["orchestratorState"],
    })

    const { stream_id: sid, scenes: sceneList } = configRef.current

    // Initial configuration
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

  // Handle incoming orchestrator events
  const handleIncoming = useCallback(
    (event: IncomingOrchestratorEvent) => {
      // Auto-respond to ping
      if (event.type === "ping") {
        sendSerializedRef.current?.({ type: "pong" }).catch((err: Error) => {
          console.error("Failed to send pong:", err)
        })
        return
      }

      if (event.type === "orchestratorState") {
        const incomingState = event.state

        // Merge with existing state (preserve local config if server omits it)
        const currentState = useOrchestratorStore.getState().state
        const nextState: OrchestratorState = {
          ...incomingState,
          scenes:
            incomingState.scenes && incomingState.scenes.length > 0
              ? incomingState.scenes
              : currentState.scenes,
          total_duration:
            incomingState.total_duration && incomingState.total_duration > 0
              ? incomingState.total_duration
              : currentState.total_duration,
        }

        // Detect scene change BEFORE updating store
        const prevScene = previousSceneRef.current
        const nextScene = nextState.current_active_scene

        // Update store (broadcast to all subscribers)
        _setState(nextState)

        // Fire scene change callback if scene changed
        if (prevScene !== nextScene) {
          previousSceneRef.current = nextScene
          queueMicrotask(() => {
            const cb = callbacksRef.current.onSceneChange
            if (cb) cb(prevScene, nextScene)
          })
        }
      } else if (event.type === "error") {
        _setError(event.message)
        const cb = callbacksRef.current.onError
        if (cb) cb(event.message)
      }
    },
    [_setState, _setError]
  )

  // WebSocket connection
  const ws = useWebSocket<IncomingOrchestratorEvent, OutgoingMessage>({
    url: orchestratorUrl || `ws://${window.location.hostname}:3000/ws`,
    incomingMessageSchema: IncomingOrchestratorEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: true,
    init,
    onIncomingMessage: handleIncoming,
  })

  // Sync WebSocket connection status to store
  useEffect(() => {
    _setConnectionStatus(ws.isConnected, ws.isInitializing)
  }, [ws.isConnected, ws.isInitializing, _setConnectionStatus])

  // Sync WebSocket error to store
  useEffect(() => {
    _setError(ws.error)
  }, [ws.error, _setError])

  // Update sendSerializedRef when ws changes
  useEffect(() => {
    sendSerializedRef.current = ws.sendSerialized
  }, [ws.sendSerialized])

  // Wire command sender to store (this is the key connection)
  useEffect(() => {
    if (!ws.isConnected || !sendSerializedRef.current) {
      _setCommandSender(async () => {
        throw new Error("Orchestrator not connected")
      }, stream_id)
      return
    }

    const commandSender = async (command: OrchestratorCommand) => {
      if (!sendSerializedRef.current) {
        throw new Error("WebSocket not available")
      }
      await sendSerializedRef.current({
        type: "tickCommand",
        stream_id,
        command,
      })
    }

    _setCommandSender(commandSender, stream_id)
  }, [ws.isConnected, stream_id, _setCommandSender])

  // Reconfigure when scenes change (guarded)
  const previousScenesRef = useRef<string>("")
  useEffect(() => {
    if (!ws.isConnected || scenes.length === 0) return

    const scenesHash = JSON.stringify(scenes)
    if (scenesHash === previousScenesRef.current) return

    const currentState = useOrchestratorStore.getState().state
    const serverScenes = currentState.scenes ?? []
    const serverHash = JSON.stringify(serverScenes)
    if (serverHash === scenesHash) {
      previousScenesRef.current = scenesHash
      return
    }

    previousScenesRef.current = scenesHash

    // Use store action to reconfigure
    useOrchestratorStore
      .getState()
      .reconfigure(scenes)
      .catch((err: Error) => {
        console.error("Failed to reconfigure:", err)
      })
  }, [scenes, ws.isConnected])

  // Update local state when scenes prop changes
  useEffect(() => {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    const currentState = useOrchestratorStore.getState().state

    if (
      JSON.stringify(currentState.scenes) === JSON.stringify(scenes) &&
      currentState.total_duration === totalDuration
    ) {
      return
    }

    _setState({
      ...currentState,
      scenes,
      total_duration: totalDuration,
      time_remaining: totalDuration - currentState.current_time,
    })
  }, [scenes, _setState])
}
