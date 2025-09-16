import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"
import type {
  UseWebSocketQueryOptions,
  UseWebSocketQueryReturn,
} from "@utils/lib/hooks/use-websocket"
import { z } from "zod"

const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "utterance",
])

// Regex for basic ISO 8601 timestamp validation (can be extended)
const isoTimestampRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

const ElementInfoSchema = z.object({
  tagName: z.string(),
  type: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined), // null → undefined
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

// Type inference from schema

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

type UtterancePrompt = z.infer<typeof UtterancePromptSchema>

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
    type: z.literal("utterance"),
    text: z.string(),
    metadata: UtteranceMetadataSchema,
  }),
])

type IncomingEvent = z.infer<typeof EventSchema>

type WsEvents = z.infer<typeof EventSchema>

type UseUtteranceWebSocketOptions = Omit<
  UseWebSocketQueryOptions<IncomingEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema"
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

export function useUtteranceWebSocket(
  options: UseUtteranceWebSocketOptions = {
    url: `ws://${window.location.hostname}:${3000}/ws`,
    queryKey: ["nowPlaying"],
    updateStrategy: "append",
    debugMode: true,
    reconnectInterval: 1000 * 60 * 60,
  }
): UseUtteranceWebSocketReturn {
  const [fullStatus, setFullStatus] = useState<UtterancePrompt>(defaultPrompt)

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
      if (options.onIncomingMessage) {
        options.onIncomingMessage(update)
      }

      if (update.type === "utterance")
        setFullStatus({ text: update.text, metadata: update.metadata })
    },
  })

  // Send helpers
  const subscribe = useCallback(() => {
    wsHook.sendMessage({ type: "subscribe", event_types: ["utterance"] })
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
      prompt: fullStatus,
      subscribe,
    }),
    [wsHook, fullStatus]
  )
}

type UseUtteranceWebSocketReturn = UseWebSocketQueryReturn<
  IncomingEvent,
  WsEvents
> & {
  prompt: UtterancePrompt
  subscribe: () => void
}
