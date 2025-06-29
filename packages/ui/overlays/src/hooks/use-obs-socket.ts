import { useCallback, useMemo, useState } from "react"
import type {
  ClientObsState,
  IncomingObsEvent,
} from "@overlays/types/obs-websocket"
import { IncomingObsEventSchema } from "@overlays/types/obs-websocket"
import { updateClientObsState } from "@overlays/utils/obs-websocket"
import type { UseWebSocketOptions, UseWebSocketReturn } from "some-ui-utils"
import { useWebSocket } from "some-ui-utils"
import { z } from "zod"

const ObsCommandSchema = z.object({
  action: z.enum([
    "startStreaming",
    "stopStreaming",
    "startRecording",
    "stopRecording",
    "setScene",
    "toggleStudioMode",
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
})

type ObsCommand = z.infer<typeof ObsCommandSchema>

type UseObsStatusWebSocketOptions = Omit<
  UseWebSocketOptions<z.infer<typeof IncomingObsEventSchema>, ObsCommand>,
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
    debugMode: true,
  }
): UseObsWebSocketReturn {
  const [fullStatus, setFullStatus] = useState<ClientObsState>(
    defaultClientObsState
  )

  const wsHook = useWebSocket<IncomingObsEvent, ObsCommand>({
    url: options.url,
    incomingMessageSchema: IncomingObsEventSchema,
    outgoingMessageSchema: ObsCommandSchema,
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
  const startStreaming = useCallback(() => {
    wsHook.sendMessage({ action: "startStreaming" })
  }, [wsHook])

  const stopStreaming = useCallback(() => {
    wsHook.sendMessage({ action: "stopStreaming" })
  }, [wsHook])

  const startRecording = useCallback(() => {
    wsHook.sendMessage({ action: "startRecording" })
  }, [wsHook])

  const stopRecording = useCallback(() => {
    wsHook.sendMessage({ action: "stopRecording" })
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

  const isSceneAvailable = useCallback([fullStatus.scenes])

  return useMemo(
    () => ({
      ...wsHook,
      status: fullStatus,
      startStreaming,
      stopStreaming,
      startRecording,
      stopRecording,
      toggleStudioMode,
      setScene,
      isSceneAvailable,
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
      isSceneAvailable,
    ]
  )
}

// Types

type UseObsWebSocketReturn = UseWebSocketReturn<
  z.infer<typeof ObsStatusPartialSchema>,
  ObsCommand
> & {
  status: ObsStatus
  startStreaming: () => void
  stopStreaming: () => void
  startRecording: () => void
  stopRecording: () => void
  toggleStudioMode: () => void
  setScene: (sceneName: string) => void
  isSceneAvailable: (sceneName: string) => boolean
}
