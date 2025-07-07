import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  IncomingEvent,
  NowPlayingType,
  WsEvents,
} from "@umag/types/now-playing"
import { EventSchema } from "@umag/types/now-playing"
import type { UseWebSocketOptions, UseWebSocketReturn } from "some-ui-utils"
import { useWebSocket } from "some-ui-utils"

type UseNowPlayingWebSocketOptions = Omit<
  UseWebSocketOptions<IncomingEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema"
>

export const defaultNowPlaying: NowPlayingType = {
  title: "Some title...",
  channel: "Some channel...",
  video_id: "",
  current_time: 0,
  duration: 0,
  thumbnail: "some thumbnail...",
}

export function useNowPlayingWebSocket(
  options: UseNowPlayingWebSocketOptions = {
    url: `ws://${window.location.hostname}:${3000}/ws`,
    debugMode: true,
  }
): UseNowPlayingWebSocketReturn {
  const [fullStatus, setFullStatus] =
    useState<NowPlayingType>(defaultNowPlaying)

  const wsHook = useWebSocket<WsEvents>({
    url: options.url,
    incomingMessageSchema: EventSchema,
    outgoingMessageSchema: EventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 5000,
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
    debugMode: options.debugMode ?? false,
    onIncomingMessage: (update) => {
      console.debug("update: ", update)
      if (options.onIncomingMessage) {
        options.onIncomingMessage(update)
      }

      if (update.type === "tabMetaData") setFullStatus(update.data)
    },
  })

  // Send helpers
  const subscribe = useCallback(() => {
    wsHook.sendMessage({ type: "subscribe", event_types: ["tabMetaData"] })
  }, [wsHook])

  useEffect(() => {
    subscribe()
  }, [subscribe])

  return useMemo(
    () => ({
      ...wsHook,
      status: fullStatus,
      subscribe,
    }),
    [wsHook, fullStatus]
  )
}

type UseNowPlayingWebSocketReturn = UseWebSocketReturn<
  IncomingEvent,
  WsEvents
> & {
  status: NowPlayingType
  subscribe: () => void
}
