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
  "utterance",
])

const isoTimestampRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

const ElementInfoSchema = z.object({
  tagName: z.string(),
  type: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  name: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  className: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  placeholder: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formMethod: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formAction: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formId: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
})

const UtteranceMetadataSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  timestamp: z.string().regex(isoTimestampRegex, {
    message: "Invalid timestamp format, expected ISO 8601",
  }),
  element: ElementInfoSchema,
})

const UtterancePromptSchema = z.object({
  text: z.string(),
  metadata: UtteranceMetadataSchema,
})

export type UtterancePrompt = z.infer<typeof UtterancePromptSchema>

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
    type: z.literal("utterance"),
    text: z.string(),
    metadata: UtteranceMetadataSchema,
  }),
])

type IncomingEvent = z.infer<typeof EventSchema>
type WsEvents = z.infer<typeof EventSchema>

type UseUtteranceOptions = Omit<
  UseWebSocketOptions<IncomingEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
>

export const defaultPrompt: UtterancePrompt = {
  text: "the utterance text",
  metadata: {
    url: "https://example.com/page",
    domain: "example.com",
    title: "Example Domain",
    timestamp: "2025-07-27T10:30:00.000Z",
    element: {
      tagName: "input",
      type: "text",
      id: "search-box",
      name: "query",
      className: "form-control search-input",
      placeholder: "Search...",
      formAction: "/search",
      formMethod: "GET",
      formId: "search-form",
    },
  },
}

export function useUtterance(options: UseUtteranceOptions) {
  const [prompt, setPrompt] = useState<UtterancePrompt>(defaultPrompt)

  const init = useCallback(async (manager: WebSocketManager) => {
    console.log("🗣️ Utterance init (atomic, singleton)")

    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["utterance"],
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

      if (event.type === "utterance") {
        setPrompt({
          text: event.text,
          metadata: event.metadata,
        })
      }
    },

    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  })

  return useMemo(
    () => ({
      ...ws,
      prompt,
    }),
    [ws, prompt]
  )
}
