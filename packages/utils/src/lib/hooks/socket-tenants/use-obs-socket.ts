import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  UseWebSocketQueryOptions,
  UseWebSocketQueryReturn,
} from "@utils/lib/hooks/use-websocket"
import { useWebSocketQuery } from "@utils/lib/hooks/use-websocket"
import { updateClientObsState } from "@utils/lib/obs"
import type { ClientObsState } from "some-types-utils"
import { IncomingObsEventSchema, ObsCommandSchema } from "some-types-utils"
import { z } from "zod"

type IncomingObsEvent = z.infer<typeof IncomingObsEventSchema>
type ObsCommand = z.infer<typeof ObsCommandSchema>
// Enum that matches your `EventType` Rust enum
export const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "obsStatus",
  "tabMetaData",
])

// Schema for `NowPlaying` struct
export const NowPlayingSchema = z.object({
  title: z.string(),
  channel: z.string(),
  video_id: z.string(),
  current_time: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  thumbnail: z.string(),
})

// Discriminated union for `Event` enum
export const EventSchema = z.discriminatedUnion("type", [
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
    type: z.literal("obsCmd"),
    cmd: ObsCommandSchema,
  }),
])

type WsEvents = z.infer<typeof EventSchema>

type UseObsStatusWebSocketOptions = Omit<
  UseWebSocketQueryOptions<IncomingObsEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema"
>

export const defaultClientObsState: ClientObsState = {
  obsVersion: "Unknown",
  websocketVersion: "Unknown",
  identified: false,
  streaming: false,
  streamTimecode: "00:00:00.000",
  recording: false,
  recordTimecode: "00:00:00.000",
  scenes: [],
  currentScene: "Unknown",
  sources: [],
  inputs: [],
  audioMutes: {},
  audioVolumes: {},
  profiles: [],
  currentProfile: "Unknown",
  collections: [],
  currentCollection: "Unknown",
  virtualCamActive: false,
  replayBufferActive: false,
  studioModeEnabled: false,
  stats: {
    cpuUsage: 0,
    memoryUsage: 0,
    availableDiskSpace: 0,
    activeFps: 0,
    averageFrameTime: 0,
    renderTotalFrames: 0,
    renderMissedFrames: 0,
    outputTotalFrames: 0,
    outputSkippedFrames: 0,
    webSocketSessionIncomingMessages: 0,
    webSocketSessionOutgoingMessages: 0,
  },
  currentTransitionName: "Cut",
  currentTransitionDuration: 300,
  transitions: [],
  sourceFilters: {},
  hotkeys: [],
  sceneItemEnableStates: {},
}

export function useObsStatusWebSocket(
  options: UseObsStatusWebSocketOptions = {
    url: `ws://${window.location.hostname}:${3000}/ws`,
    queryKey: ["obs_socket"],
    updateStrategy: "append",
    debugMode: true,
  }
): UseObsWebSocketReturn {
  const [fullStatus, setFullStatus] = useState<ClientObsState>(
    defaultClientObsState
  )

  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  const wsHook = useWebSocketQuery<IncomingObsEvent>({
    url: options.url,
    queryKey: options.queryKey,
    updateStrategy: options.updateStrategy,
    incomingMessageSchema: IncomingObsEventSchema,
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

      if (update.type === "obsStatus")
        setFullStatus((prev) => updateClientObsState(prev, update.status))
    },
  })

  // Send helpers
  const subscribe = useCallback(() => {
    wsHook.sendMessage({ type: "subscribe", event_types: ["obsStatus"] })
  }, [wsHook])

  const startStreaming = useCallback(() => {
    wsHook.sendMessage({
      type: "obsCmd",
      cmd: {
        type: "startStream",
      },
    })
  }, [wsHook])

  const stopStreaming = useCallback(() => {
    wsHook.sendMessage({ type: "obsCmd", cmd: { type: "stopStream" } })
  }, [wsHook])

  const startRecording = useCallback(() => {
    wsHook.sendMessage({ type: "obsCmd", cmd: { type: "startRecording" } })
  }, [wsHook])

  const stopRecording = useCallback(() => {
    wsHook.sendMessage({ type: "obsCmd", cmd: { type: "stopRecording" } })
  }, [wsHook])

  const toggleStudioMode = useCallback(() => {
    wsHook.sendMessage({ action: "toggleStudioMode" })
  }, [wsHook])

  const setScene = useCallback(
    (sceneName: string) => {
      wsHook.sendMessage({
        action: "setScene",
        params: { scene: sceneName },
      })
    },
    [wsHook]
  )

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
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      toggleStudioMode,
      setScene,
    }),
    [
      wsHook,
      fullStatus,
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      toggleStudioMode,
      setScene,
    ]
  )
}

// Types

type UseObsWebSocketReturn = UseWebSocketQueryReturn<
  IncomingObsEvent,
  ObsCommand | WsEvents
> & {
  status: ClientObsState
  subscribe: () => void
  startStreaming: () => void
  stopStreaming: () => void
  startRecording: () => void
  stopRecording: () => void
  toggleStudioMode: () => void
  setScene: (sceneName: string) => void
}
