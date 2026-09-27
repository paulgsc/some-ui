import { useCallback, useEffect, useRef } from "react"
import type {
  IncomingEvent,
  OrchestratorCommand,
  OutgoingMessage,
  SceneConfig,
} from "@some-ui/types"
import { IncomingEventSchema, OutgoingMessageSchema } from "@some-ui/types"
import type { WebSocketManager } from "@some-ui/ws"
import { resolveLanSocketUrl, useWebSocket } from "@some-ui/ws"

import { useOrchestratorStore } from "../../../context/zustand-store"

/**
 * `file_host`'s port and socket route. Spelled here rather than imported:
 * see the identical note in `@some-ui/umag`'s `companion-socket` for why
 * one integer does not earn a shared package under
 * `packages/SHARED_WORKSPACE_DOCTRINE.md` §1.
 */
const FILE_HOST_PORT = 3000
const FILE_HOST_SOCKET_PATH = "/ws"

export type UseOrchestratorConfig = {
  stream_id: string
  scenes: Array<SceneConfig>
  /**
   * Explicit socket URL. Left unset, the orchestrator asks
   * `resolveLanSocketUrl` for `file_host`'s, which answers `undefined` on
   * any origin that has no LAN companion server behind it - and
   * `useWebSocket` then stays deliberately disconnected rather than dialing
   * a port that is not there.
   */
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

  // Reads the ref inside the callback rather than during render, so the
  // manager always calls through to the *current* onError instead of the one
  // that happened to be current when the socket was created.
  const handleError = useCallback((error: Event | Error) => {
    callbacksRef.current.onError?.(error)
  }, [])

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
        // A pong is fire-and-forget; a failed send means the socket is
        // already gone, which the reconnect path handles.
        void sendRef.current?.({ type: "pong" })
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
    url:
      orchestratorUrl ??
      resolveLanSocketUrl(FILE_HOST_PORT, FILE_HOST_SOCKET_PATH),
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: OutgoingMessageSchema,
    autoReconnect: true,
    reconnectInterval: 3000,
    init,
    onIncomingMessage: onIncoming,
    onError: handleError,
  })

  // The store's actions are listed as dependencies rather than silenced:
  // zustand defines them once in `create`, so they are stable for the store's
  // lifetime and adding them changes how often nothing runs.
  useEffect(() => {
    _setConnectionStatus(ws.isConnected, ws.isInitializing)
  }, [_setConnectionStatus, ws.isConnected, ws.isInitializing])

  useEffect(() => {
    _setError(ws.error)
  }, [_setError, ws.error])

  useEffect(() => {
    sendRef.current = ws.sendSerialized
  }, [ws.sendSerialized])

  useEffect(() => {
    if (!ws.isConnected || !sendRef.current) {
      _setCommandSender(
        () => Promise.reject(new Error("Orchestrator not connected")),
        stream_id
      )
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
  }, [_setCommandSender, ws.isConnected, stream_id])
}
