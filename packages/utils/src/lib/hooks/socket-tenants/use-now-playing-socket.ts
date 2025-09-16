import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  UseWebSocketQueryOptions,
  UseWebSocketQueryReturn,
} from "@utils/lib/hooks/use-websocket"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"
import { z } from "zod"

const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "obsStatus",
  "tabMetaData",
])

// Schema for `NowPlaying` struct
const NowPlayingSchema = z.object({
  title: z.string().optional(),
  channel: z.string().optional(),
  video_id: z.string().optional(),
  current_time: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  thumbnail: z.string().optional(),
})

type NowPlayingType = z.infer<typeof NowPlayingSchema>

// Discriminated union for `Event` enum
const EventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("pong"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(EventTypeSchema),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    event_types: z.array(EventTypeSchema),
  }),
  z.object({
    type: z.literal("clientCount"),
    count: z.number().nonnegative(),
  }),

  z.object({
    type: z.literal("tabMetaData"),
    data: NowPlayingSchema,
  }),
])

type IncomingEvent = z.infer<typeof EventSchema>

type WsEvents = z.infer<typeof EventSchema>

type UseNowPlayingWebSocketOptions = Omit<
  UseWebSocketQueryOptions<IncomingEvent, WsEvents>,
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
    queryKey: ["nowPlaying"],
    updateStrategy: "append",
    debugMode: true,
    reconnectInterval: 1000 * 60 * 60,
  }
): UseNowPlayingWebSocketReturn {
  const [fullStatus, setFullStatus] =
    useState<NowPlayingType>(defaultNowPlaying)

  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  const wsHook = useWebSocketQuery<WsEvents>({
    url: options.url,
    queryKey: options.queryKey,
    updateStrategy: options.updateStrategy,
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

  // Handle subscription separately
  useEffect(() => {
    subscribe()
  }, [subscribe])

  // Handle ping interval separately - only reset when connection state changes
  useEffect(() => {
    const keepAlive = 1000 * 90 // Server makes connection stale after 120s

    if (wsHook.isConnected) {
      intervalRef.current = setInterval(() => {
        if (wsHook.isConnected) {
          wsHook.sendMessage({ type: "pong" })
        }
      }, keepAlive)
    }

    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [wsHook.isConnected]) // Only depend on connection state

  return useMemo(
    () => ({
      ...wsHook,
      status: fullStatus,
      subscribe,
    }),
    [wsHook, fullStatus]
  )
}

type UseNowPlayingWebSocketReturn = UseWebSocketQueryReturn<
  IncomingEvent,
  WsEvents
> & {
  status: NowPlayingType
  subscribe: () => void
}
