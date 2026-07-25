import { useCallback } from "react"
import type { IncomingEvent, OutgoingNowPlayingEvent } from "@some-ui/types"
import {
  IncomingEventSchema,
  OutgoingNowPlayingEventSchema,
} from "@some-ui/types"
import type {
  UseWebSocketOptions,
  UseWebSocketReturn,
  WebSocketManager,
} from "@some-ui/ws"
import { useWebSocket } from "@some-ui/ws"

import { pushNowPlaying } from "./store"

type UseNowPlayingOptions = Omit<
  UseWebSocketOptions<IncomingEvent, OutgoingNowPlayingEvent>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
>

/**
 * Stateless WebSocket hook that pushes NowPlaying events to the global store.
 *
 * Components can subscribe via `useLatestNowPlaying()`.
 */
export function useNowPlaying(
  options: UseNowPlayingOptions
): UseWebSocketReturn<IncomingEvent, OutgoingNowPlayingEvent> {
  // WebSocket init callback: subscribe to tabMetaData events
  const init = useCallback(async (manager: WebSocketManager) => {
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["tabMetaData"],
    })
  }, [])

  // Set up WebSocket
  const ws = useWebSocket<IncomingEvent, OutgoingNowPlayingEvent>({
    url: options.url,
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: OutgoingNowPlayingEventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 3600000, // 1 hour
    debugMode: options.debugMode ?? false,
    init,
    onIncomingMessage: (event) => {
      // Call user's handler if provided
      options.onIncomingMessage?.(event)

      // Push tabMetaData events to the global store
      if (event.type === "tabMetaData") {
        pushNowPlaying(event.data)
      }
    },
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  })

  return ws
}
