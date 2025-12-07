import { useCallback, useMemo, useState } from "react"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type { UseWebSocketOptions } from "@utils/lib/hooks/websocket"
import { updateClientObsState } from "@utils/lib/obs"
import type { ClientObsState } from "some-types-utils"
import { IncomingObsEventSchema, ObsCommandSchema } from "some-types-utils"
import { z } from "zod"

type IncomingObsEvent = z.infer<typeof IncomingObsEventSchema>

export const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "obsStatus",
  "tabMetaData",
])

export const EventSchema = z.discriminatedUnion("type", [
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
    type: z.literal("obsCmd"),
    cmd: ObsCommandSchema,
  }),
])

type WsEvents = z.infer<typeof EventSchema>

type UseObsStatusOptions = Omit<
  UseWebSocketOptions<IncomingObsEvent, WsEvents>,
  "incomingMessageSchema" | "outgoingMessageSchema" | "init"
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

export function useObsStatus(options: UseObsStatusOptions) {
  const [status, setStatus] = useState<ClientObsState>(defaultClientObsState)

  const ws = useWebSocket<IncomingObsEvent, WsEvents>({
    url: options.url,
    incomingMessageSchema: IncomingObsEventSchema,
    outgoingMessageSchema: EventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 5000,
    debugMode: options.debugMode ?? false,

    // Atomic init - runs once
    init: async (manager) => {
      console.log("🎥 OBS init (atomic, singleton)")

      // Subscribe to status updates
      await manager.sendSerialized({
        type: "subscribe",
        event_types: ["obsStatus"],
      })

      // Start keepalive pings
      const keepAlive = 90000 // 90s (server timeout: 120s)
      setInterval(() => {
        if (manager.isConnected) {
          manager.sendMessage({ type: "pong" })
        }
      }, keepAlive)
    },

    onIncomingMessage: (event) => {
      if (options.onIncomingMessage) {
        options.onIncomingMessage(event)
      }

      if (event.type === "obsStatus") {
        setStatus((prev) => updateClientObsState(prev, event.status))
      }
    },

    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
  })

  // Serialized command helpers
  const startStreaming = useCallback(() => {
    ws.sendSerialized({
      type: "obsCmd",
      cmd: { type: "startStream" },
    })
  }, [ws.sendSerialized])

  const stopStreaming = useCallback(() => {
    ws.sendSerialized({
      type: "obsCmd",
      cmd: { type: "stopStream" },
    })
  }, [ws.sendSerialized])

  const startRecording = useCallback(() => {
    ws.sendSerialized({
      type: "obsCmd",
      cmd: { type: "startRecording" },
    })
  }, [ws.sendSerialized])

  const stopRecording = useCallback(() => {
    ws.sendSerialized({
      type: "obsCmd",
      cmd: { type: "stopRecording" },
    })
  }, [ws.sendSerialized])

  const toggleStudioMode = useCallback(() => {
    ws.sendSerialized({
      type: "obsCmd",
      cmd: { type: "toggleStudioMode" },
    })
  }, [ws.sendSerialized])


  return useMemo(
    () => ({
      ...ws,
      status,
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      toggleStudioMode,
    }),
    [
      ws,
      status,
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      toggleStudioMode,
    ]
  )
}
