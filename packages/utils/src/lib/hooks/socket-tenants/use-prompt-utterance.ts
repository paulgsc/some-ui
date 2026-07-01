import { useCallback, useMemo, useState } from "react"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  UseWebSocketOptions,
  UseWebSocketReturn,
  WebSocketManager,
} from "@utils/lib/hooks/websocket"
import type {
  IncomingEvent,
  UtteranceEvents,
  UtterancePrompt,
} from "some-types-utils"
import { IncomingEventSchema, UtteranceEventTypeSchema } from "some-types-utils"

type UseUtteranceOptions = Omit<
  UseWebSocketOptions<IncomingEvent, UtteranceEvents>,
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

export function useUtterance(options: UseUtteranceOptions): UseWebSocketReturn<
  IncomingEvent,
  UtteranceEvents
> & {
  prompt: UtterancePrompt
} {
  const [prompt, setPrompt] = useState<UtterancePrompt>(defaultPrompt)

  const init = useCallback(async (manager: WebSocketManager) => {
    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["utterance"],
    })
  }, [])

  const ws = useWebSocket<IncomingEvent, UtteranceEvents>({
    url: options.url,
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: UtteranceEventTypeSchema,
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
