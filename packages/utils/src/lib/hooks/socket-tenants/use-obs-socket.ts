import { useCallback, useMemo, useState } from "react"
import { useWebSocket } from "@utils/lib/hooks/websocket"
import type {
  UseWebSocketOptions,
  WebSocketManager,
} from "@utils/lib/hooks/websocket"
import { updateClientObsState } from "@utils/lib/obs"
import type {
  ClientObsState,
  IncomingEvent,
  OutgoingObsEvent,
} from "some-types-utils"
import { IncomingEventSchema, OutgoingObsEventSchema } from "some-types-utils"

type UseObsStatusOptions = Omit<
  UseWebSocketOptions<IncomingEvent, OutgoingObsEvent>,
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

  const init = useCallback(async (manager: WebSocketManager) => {
    console.log("🎥 OBS init (atomic, singleton)")

    await manager.sendSerialized({
      type: "subscribe",
      event_types: ["obsStatus"],
    })
  }, [])

  const ws = useWebSocket<IncomingEvent, OutgoingObsEvent>({
    url: options.url,
    incomingMessageSchema: IncomingEventSchema,
    outgoingMessageSchema: OutgoingObsEventSchema,
    autoReconnect: options.autoReconnect ?? true,
    reconnectInterval: options.reconnectInterval ?? 5000,
    debugMode: options.debugMode ?? false,

    init,

    onIncomingMessage: (event) => {
      if (options.onIncomingMessage) {
        options.onIncomingMessage(event)
      }

      if (event.type === "obsStatus") {
        console.log("obsStatus event: ", event)
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
