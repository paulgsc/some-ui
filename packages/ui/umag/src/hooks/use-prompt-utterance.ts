import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EventSchema } from "@umag/types/spectrum"
import type {
  IncomingEvent,
  UtterancePrompt,
  WsEvents,
} from "@umag/types/spectrum"
import type { UseWebSocketOptions, UseWebSocketReturn } from "some-ui-utils"
import { useWebSocket } from "some-ui-utils"

type UseUtteranceWebSocketOptions = Omit<
  UseWebSocketOptions<IncomingEvent, WsEvents>,
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
    debugMode: true,
    reconnectInterval: 1000 * 60 * 60,
  }
): UseUtteranceWebSocketReturn {
  const [fullStatus, setFullStatus] = useState<UtterancePrompt>(defaultPrompt)

  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

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

type UseUtteranceWebSocketReturn = UseWebSocketReturn<
  IncomingEvent,
  WsEvents
> & {
  prompt: UtterancePrompt
  subscribe: () => void
}
