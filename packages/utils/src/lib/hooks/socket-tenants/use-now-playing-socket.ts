import { useCallback, useMemo, useState } from "react"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  UseWebSocketOptions,
  WebSocketManager,
} from "@utils/lib/hooks/websocket"
import { z } from "zod"

const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "obsStatus",
  "tabMetaData",
])

const NowPlayingSchema = z.object({
  title: z.string().optional(),
  channel: z.string().optional(),
  video_id: z.string().optional(),
  current_time: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  thumbnail: z.string().optional(),
})

export type NowPlayingType = z.infer<typeof NowPlayingSchema>

const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), message: z.string() }),
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

type UseNowPlayingOptions = Omit<
  UseWebSocketOptions<IncomingEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
>

export const defaultNowPlaying: NowPlayingType = {
  title: "Some title...",
  channel: "Some channel...",
  video_id: "",
  current_time: 0,
  duration: 0,
  thumbnail: "some thumbnail...",
}

export function useNowPlaying(options: UseNowPlayingOptions) {
  const [status, setStatus] = useState<NowPlayingType>(defaultNowPlaying)

  const init = useCallback(async (manager: WebSocketManager) => {
    console.log("🎵 NowPlaying init (atomic, singleton)")

    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["tabMetaData"],
    })
  }, [])

  const ws = useWebSocket<IncomingEvent, WsEvents>({
    url: options.url,
    incomingMessageSchema: EventSchema,
    outgoingMessageSchema: EventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 3600000, // 1 hour
    debugMode: options.debugMode ?? false,

    init,

    onIncomingMessage: (event) => {
      if (options.onIncomingMessage) {
        options.onIncomingMessage(event)
      }

      if (event.type === "tabMetaData") {
        setStatus(event.data)
      }
    },

    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  })

  return useMemo(
    () => ({
      ...ws,
      status,
    }),
    [ws, status]
  )
}
