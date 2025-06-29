import { z } from "zod"

export const SceneInfoSchema = z.object({
  name: z.string(),
  index: z.number().optional(),
})

export const SourceInfoSchema = z.object({
  name: z.string(),
  typeId: z.string(),
  kind: z.string(),
})

export const InputInfoSchema = z.object({
  name: z.string(),
  kind: z.string(),
  unversionedKind: z.string(),
})

export const TransitionInfoSchema = z.object({
  name: z.string(),
  kind: z.string(),
  fixed: z.boolean(),
})

export const FilterInfoSchema = z.object({
  name: z.string(),
  kind: z.string(),
  index: z.number(),
  enabled: z.boolean(),
})

export const HotkeyInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
})

export const ObsStatsSchema = z.object({
  cpuUsage: z.number(),
  memoryUsage: z.number(),
  availableDiskSpace: z.number(),
  activeFps: z.number(),
  averageFrameTime: z.number(),
  renderTotalFrames: z.number(),
  renderMissedFrames: z.number(),
  outputTotalFrames: z.number(),
  outputSkippedFrames: z.number(),
  webSocketSessionIncomingMessages: z.number(),
  webSocketSessionOutgoingMessages: z.number(),
})

const StreamStatusResponseDataSchema = z.object({
  streaming: z.boolean(),
  timecode: z.string(),
})
const RecordingStatusResponseDataSchema = z.object({
  recording: z.boolean(),
  timecode: z.string(),
})
const SceneListResponseDataSchema = z.object({
  scenes: z.array(SceneInfoSchema),
  currentScene: z.string(),
})
const CurrentSceneResponseDataSchema = z.object({ sceneName: z.string() })
const SourcesListResponseDataSchema = z.object({
  sources: z.array(SourceInfoSchema),
})
const InputListResponseDataSchema = z.object({
  inputs: z.array(InputInfoSchema),
})
const AudioMuteResponseDataSchema = z.object({
  inputName: z.string(),
  muted: z.boolean(),
})
const AudioVolumeResponseDataSchema = z.object({
  inputName: z.string(),
  volumeDb: z.number(),
  volumeMul: z.number(),
})
const ProfileListResponseDataSchema = z.object({
  profiles: z.array(z.string()),
  currentProfile: z.string(),
})
const CurrentProfileResponseDataSchema = z.object({ profileName: z.string() })
const SceneCollectionListResponseDataSchema = z.object({
  collections: z.array(z.string()),
  currentCollection: z.string(),
})
const CurrentCollectionResponseDataSchema = z.object({
  collectionName: z.string(),
})
const VirtualCamStatusResponseDataSchema = z.object({ active: z.boolean() })

const ReplayBufferStatusResponseDataSchema = z.object({ active: z.boolean() })

const StudioModeResponseDataSchema = z.object({ enabled: z.boolean() })

const StatsResponseDataSchema = z.object({ stats: ObsStatsSchema })

const CurrentTransitionResponseDataSchema = z.object({
  transitionName: z.string(),
  transitionDuration: z.number(),
})
const TransitionListResponseDataSchema = z.object({
  transitions: z.array(TransitionInfoSchema),
})
const FilterListResponseDataSchema = z.object({
  sourceName: z.string(),
  filters: z.array(FilterInfoSchema),
})
const HotkeyListResponseDataSchema = z.object({
  hotkeys: z.array(HotkeyInfoSchema),
})
const VersionResponseDataSchema = z.object({
  obsVersion: z.string(),
  websocketVersion: z.string(),
})
const StreamStateChangedDataSchema = z.object({
  streaming: z.boolean(),
  timecode: z.string().optional(),
})
const RecordStateChangedDataSchema = z.object({
  recording: z.boolean(),
  timecode: z.string().optional(),
})
const CurrentProgramSceneChangedDataSchema = z.object({
  sceneName: z.string(),
})
const SceneItemEnableStateChangedDataSchema = z.object({
  sceneName: z.string(),
  itemId: z.number(),
  enabled: z.boolean(),
})
const InputMuteStateChangedDataSchema = z.object({
  inputName: z.string(),
  muted: z.boolean(),
})
const InputVolumeChangedDataSchema = z.object({
  inputName: z.string(),
  volumeDb: z.number(),
  volumeMul: z.number(),
})
const VirtualcamStateChangedDataSchema = z.object({ active: z.boolean() })

const ReplayBufferStateChangedDataSchema = z.object({ active: z.boolean() })

const StudioModeStateChangedDataSchema = z.object({ enabled: z.boolean() })

const CurrentSceneTransitionChangedDataSchema = z.object({
  transitionName: z.string(),
})
const SceneTransitionStartedDataSchema = z.object({
  transitionName: z.string(),
})
const SceneTransitionEndedDataSchema = z.object({ transitionName: z.string() })
const UnknownResponseDataSchema = z.object({
  requestType: z.string(),
  data: z.any(),
})
const UnknownEventDataSchema = z.object({
  eventType: z.string(),
  data: z.any(),
})
const HelloDataSchema = z.object({ obsVersion: z.string() })

const IdentifiedDataSchema = z.object({})

export const ObsEventSchema = z.discriminatedUnion("type", [
  // Stream and Recording Status
  z.object({
    type: z.literal("streamStatusResponse"),
    data: StreamStatusResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("recordingStatusResponse"),
    data: RecordingStatusResponseDataSchema.partial(),
  }),
  // Scene Management
  z.object({
    type: z.literal("sceneListResponse"),
    data: SceneListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("currentSceneResponse"),
    data: CurrentSceneResponseDataSchema.partial(),
  }),
  // Source Management
  z.object({
    type: z.literal("sourcesListResponse"),
    data: SourcesListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("inputListResponse"),
    data: InputListResponseDataSchema.partial(),
  }),
  // Audio Management
  z.object({
    type: z.literal("audioMuteResponse"),
    data: AudioMuteResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("audioVolumeResponse"),
    data: AudioVolumeResponseDataSchema.partial(),
  }),
  // Profile and Collection Management
  z.object({
    type: z.literal("profileListResponse"),
    data: ProfileListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("currentProfileResponse"),
    data: CurrentProfileResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("sceneCollectionListResponse"),
    data: SceneCollectionListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("currentCollectionResponse"),
    data: CurrentCollectionResponseDataSchema.partial(),
  }),
  // Virtual Camera
  z.object({
    type: z.literal("virtualCamStatusResponse"),
    data: VirtualCamStatusResponseDataSchema.partial(),
  }),
  // Replay Buffer
  z.object({
    type: z.literal("replayBufferStatusResponse"),
    data: ReplayBufferStatusResponseDataSchema.partial(),
  }),
  // Studio Mode
  z.object({
    type: z.literal("studioModeResponse"),
    data: StudioModeResponseDataSchema.partial(),
  }),
  // Statistics
  z.object({
    type: z.literal("statsResponse"),
    data: StatsResponseDataSchema.partial(),
  }),
  // Transitions
  z.object({
    type: z.literal("currentTransitionResponse"),
    data: CurrentTransitionResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("transitionListResponse"),
    data: TransitionListResponseDataSchema.partial(),
  }),
  // Filters
  z.object({
    type: z.literal("filterListResponse"),
    data: FilterListResponseDataSchema.partial(),
  }),
  // Hotkeys
  z.object({
    type: z.literal("hotkeyListResponse"),
    data: HotkeyListResponseDataSchema.partial(),
  }),
  // Version
  z.object({
    type: z.literal("versionResponse"),
    data: VersionResponseDataSchema.partial(),
  }),
  // Real-time events (op: 5)
  z.object({
    type: z.literal("streamStateChanged"),
    data: StreamStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("recordStateChanged"),
    data: RecordStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("currentProgramSceneChanged"),
    data: CurrentProgramSceneChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("sceneItemEnableStateChanged"),
    data: SceneItemEnableStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("inputMuteStateChanged"),
    data: InputMuteStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("inputVolumeChanged"),
    data: InputVolumeChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("virtualcamStateChanged"),
    data: VirtualcamStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("replayBufferStateChanged"),
    data: ReplayBufferStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("studioModeStateChanged"),
    data: StudioModeStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("currentSceneTransitionChanged"),
    data: CurrentSceneTransitionChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("sceneTransitionStarted"),
    data: SceneTransitionStartedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("sceneTransitionEnded"),
    data: SceneTransitionEndedDataSchema.partial(),
  }),
  // Generic events for unhandled cases
  z.object({
    type: z.literal("unknownResponse"),
    data: UnknownResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("unknownEvent"),
    data: UnknownEventDataSchema.partial(),
  }),
  // Connection events
  z.object({ type: z.literal("hello"), data: HelloDataSchema.partial() }),
  z.object({
    type: z.literal("identified"),
    data: IdentifiedDataSchema.partial(),
  }),
])

export type ObsEvent = z.infer<typeof ObsEventSchema>

export const IncomingObsEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("obsStatus"),
    status: ObsEventSchema,
  }),

  z.object({
    type: z.literal("clientCount"),
    count: z.number().int().nonnegative(),
  }),

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
])

export type SceneInfo = {
  name: string
  index?: number
}

export type SourceInfo = {
  name: string
  typeId: string
  kind: string
}

export type InputInfo = {
  name: string
  kind: string
  unversionedKind: string
}

export type TransitionInfo = {
  name: string
  kind: string
  fixed: boolean
}

export type FilterInfo = {
  name: string
  kind: string
  index: number
  enabled: boolean
}

export type HotkeyInfo = {
  name: string
  description: string
}

export type ObsStats = {
  cpuUsage: number
  memoryUsage: number
  availableDiskSpace: number
  activeFps: number
  averageFrameTime: number
  renderTotalFrames: number
  renderMissedFrames: number
  outputTotalFrames: number
  outputSkippedFrames: number
  webSocketSessionIncomingMessages: number
  webSocketSessionOutgoingMessages: number
}

export type ClientObsState = {
  obsVersion: string

  websocketVersion: string

  identified: boolean

  streaming: boolean

  streamTimecode: string

  recording: boolean

  recordTimecode: string

  scenes: Array<SceneInfo>

  currentScene: string

  sources: Array<SourceInfo>

  inputs: Array<InputInfo>

  audioMutes: Record<string, boolean>

  audioVolumes: Record<string, { volumeDb: number; volumeMul: number }>

  profiles: Array<string>

  currentProfile: string

  collections: Array<string>

  currentCollection: string

  virtualCamActive: boolean

  replayBufferActive: boolean

  studioModeEnabled: boolean

  stats: ObsStats

  currentTransitionName: string

  currentTransitionDuration: number

  transitions: Array<TransitionInfo>

  lastTransitionStartedName?: string

  lastTransitionEndedName?: string

  sourceFilters: Record<string, Array<FilterInfo>>

  hotkeys: Array<HotkeyInfo>

  sceneItemEnableStates: Record<string, Record<number, boolean>>

  lastUnknownResponse?: { requestType: string; data: unknown }

  lastUnknownEvent?: { eventType: string; data: unknown }
}
