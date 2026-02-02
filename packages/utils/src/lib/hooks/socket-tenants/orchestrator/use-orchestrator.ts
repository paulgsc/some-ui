import { useCallback, useEffect, useRef } from "react"
import { useOrchestratorStore } from "@utils/lib/context/zustand-store"
import type { WebSocketManager } from "@utils/lib/hooks/websocket"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  IncomingEvent,
  OrchestratorCommand,
  OutgoingMessage,
  SceneConfig,
} from "some-types-utils"
import { IncomingEventSchema, OutgoingMessageSchema } from "some-types-utils"

export type UseOrchestratorConfig = {
  stream_id: string
  scenes: Array<SceneConfig>
  orchestratorUrl?: string
  onSceneChange?: (from: string | null, to: string | null) => void
  onError?: (error: Event | Error) => void
}

export function useOrchestrator({
  stream_id,
  scenes,
  orchestratorUrl,
  onSceneChange,
  onError,
}: UseOrchestratorConfig): void {
  const { _setState, _setError, _setConnectionStatus, _setCommandSender } =
    useOrchestratorStore.getState()

  const prevSceneRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onSceneChange, onError })
  const sendRef = useRef<((msg: OutgoingMessage) => Promise<void>) | null>(null)

  useEffect(() => {
    callbacksRef.current = { onSceneChange, onError }
  }, [onSceneChange, onError])

  const init = useCallback(
    async (manager: WebSocketManager) => {
      await manager.sendSerialized({
        type: "subscribe",
        event_types: ["orchestratorState"],
      })

      if (scenes.length > 0) {
        await manager.sendSerialized({
          type: "orchestratorCommandData",
          stream_id,
          command: {
            Configure: {
              scenes,
              tick_interval_ms: 1000,
              loop_scenes: false,
            },
          },
        })
      }
    },
    [scenes, stream_id]
  )

  const onIncoming = useCallback(
    (event: IncomingEvent) => {
      if (event.type === "ping") {
        sendRef.current?.({ type: "pong" })
        return
      }

      if (event.type === "orchestratorState") {
        const next = event.state
        const prev = prevSceneRef.current
        const curr = next.current_active_scene

        _setState(next)

        if (prev !== curr) {
          prevSceneRef.current = curr
          queueMicrotask(() => {
            callbacksRef.current.onSceneChange?.(prev, curr)
          })
        }
        return
      }

      if (event.type === "error") {
        _setError(event.message)
        callbacksRef.current.onError?.(new Error(event.message))
      }
    },
    [_setState, _setError]
  )

  const ws = useWebSocket<IncomingEvent, OutgoingMessage>({
    url: orchestratorUrl ?? `ws://${window.location.hostname}:3000/ws`,
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    init,
    onIncomingMessage: onIncoming,
    onError: callbacksRef.current.onError,
  })

  useEffect(() => {
    _setConnectionStatus(ws.isConnected, ws.isInitializing)
  }, [ws.isConnected, ws.isInitializing])

  useEffect(() => {
    _setError(ws.error)
  }, [ws.error])

  useEffect(() => {
    sendRef.current = ws.sendSerialized
  }, [ws.sendSerialized])

  useEffect(() => {
    if (!ws.isConnected || !sendRef.current) {
      _setCommandSender(async () => {
        throw new Error("Orchestrator not connected")
      }, stream_id)
      return
    }

    const sendCommand = async (command: OrchestratorCommand): Promise<void> => {
      await sendRef.current!({
        type: "orchestratorCommandData",
        stream_id,
        command,
      })
    }

    _setCommandSender(sendCommand, stream_id)
  }, [ws.isConnected, stream_id])
}
