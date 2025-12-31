import { useCallback } from "react"
import { pushNowPlaying } from "@utils/lib/context/zustand-store"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  UseWebSocketOptions,
  WebSocketManager,
} from "@utils/lib/hooks/websocket"
import type {
  IncomingNowPlayingEvent,
  OutgoingNowPlayingEvent,
} from "some-types-utils"
import {
  IncomingNowPlayingEventSchema,
  OutgoingNowPlayingEventSchema,
} from "some-types-utils"

type UseNowPlayingOptions = Omit<
  UseWebSocketOptions<IncomingNowPlayingEvent, OutgoingNowPlayingEvent>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
>

/**
 * Stateless WebSocket hook that pushes NowPlaying events to the global store.
 *
 * Components can subscribe via `useLatestNowPlaying()`.
 */
export function useNowPlaying(options: UseNowPlayingOptions) {
  // WebSocket init callback: subscribe to tabMetaData events
  const init = useCallback(async (manager: WebSocketManager) => {
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["tabMetaData"],
    })
  }, [])

  // Set up WebSocket
  const ws = useWebSocket<IncomingNowPlayingEvent, OutgoingNowPlayingEvent>({
    url: options.url,
    incomingMessageSchema: IncomingNowPlayingEventSchema,
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
