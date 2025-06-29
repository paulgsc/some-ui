import { z } from "zod"

export const SceneInfoSchema = z.object({
  name: z.string(),
  index: z.number().optional(),
})

export const SourceInfoSchema = z.object({
  name: z.string(),
  type_id: z.string(),
  kind: z.string(),
})

export const InputInfoSchema = z.object({
  name: z.string(),
  kind: z.string(),
  unversioned_kind: z.string(),
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
  cpu_usage: z.number(),
  memory_usage: z.number(),
  available_disk_space: z.number(),
  active_fps: z.number(),
  average_frame_time: z.number(),
  render_total_frames: z.number(),
  render_missed_frames: z.number(),
  output_total_frames: z.number(),
  output_skipped_frames: z.number(),
  web_socket_session_incoming_messages: z.number(),
  web_socket_session_outgoing_messages: z.number(),
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
  current_scene: z.string(),
})
const CurrentSceneResponseDataSchema = z.object({ scene_name: z.string() })
const SourcesListResponseDataSchema = z.object({
  sources: z.array(SourceInfoSchema),
})
const InputListResponseDataSchema = z.object({
  inputs: z.array(InputInfoSchema),
})
const AudioMuteResponseDataSchema = z.object({
  input_name: z.string(),
  muted: z.boolean(),
})
const AudioVolumeResponseDataSchema = z.object({
  input_name: z.string(),
  volume_db: z.number(),
  volume_mul: z.number(),
})
const ProfileListResponseDataSchema = z.object({
  profiles: z.array(z.string()),
  current_profile: z.string(),
})
const CurrentProfileResponseDataSchema = z.object({ profile_name: z.string() })
const SceneCollectionListResponseDataSchema = z.object({
  collections: z.array(z.string()),
  current_collection: z.string(),
})
const CurrentCollectionResponseDataSchema = z.object({
  collection_name: z.string(),
})
const VirtualCamStatusResponseDataSchema = z.object({ active: z.boolean() })

const ReplayBufferStatusResponseDataSchema = z.object({ active: z.boolean() })

const StudioModeResponseDataSchema = z.object({ enabled: z.boolean() })

const StatsResponseDataSchema = z.object({ stats: ObsStatsSchema })

const CurrentTransitionResponseDataSchema = z.object({
  transition_name: z.string(),
  transition_duration: z.number(),
})
const TransitionListResponseDataSchema = z.object({
  transitions: z.array(TransitionInfoSchema),
})
const FilterListResponseDataSchema = z.object({
  source_name: z.string(),
  filters: z.array(FilterInfoSchema),
})
const HotkeyListResponseDataSchema = z.object({
  hotkeys: z.array(HotkeyInfoSchema),
})
const VersionResponseDataSchema = z.object({
  obs_version: z.string(),
  websocket_version: z.string(),
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
  scene_name: z.string(),
})
const SceneItemEnableStateChangedDataSchema = z.object({
  scene_name: z.string(),
  item_id: z.number(),
  enabled: z.boolean(),
})
const InputMuteStateChangedDataSchema = z.object({
  input_name: z.string(),
  muted: z.boolean(),
})
const InputVolumeChangedDataSchema = z.object({
  input_name: z.string(),
  volume_db: z.number(),
  volume_mul: z.number(),
})
const VirtualcamStateChangedDataSchema = z.object({ active: z.boolean() })

const ReplayBufferStateChangedDataSchema = z.object({ active: z.boolean() })

const StudioModeStateChangedDataSchema = z.object({ enabled: z.boolean() })

const CurrentSceneTransitionChangedDataSchema = z.object({
  transition_name: z.string(),
})
const SceneTransitionStartedDataSchema = z.object({
  transition_name: z.string(),
})
const SceneTransitionEndedDataSchema = z.object({ transition_name: z.string() })
const UnknownResponseDataSchema = z.object({
  request_type: z.string(),
  data: z.any(),
})
const UnknownEventDataSchema = z.object({
  event_type: z.string(),
  data: z.any(),
})
const HelloDataSchema = z.object({ obs_version: z.string() })

const IdentifiedDataSchema = z.object({})

export const ObsEventSchema = z.discriminatedUnion("type", [
  // Stream and Recording Status
  z.object({
    type: z.literal("StreamStatusResponse"),
    data: StreamStatusResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("RecordingStatusResponse"),
    data: RecordingStatusResponseDataSchema.partial(),
  }),
  // Scene Management
  z.object({
    type: z.literal("SceneListResponse"),
    data: SceneListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("CurrentSceneResponse"),
    data: CurrentSceneResponseDataSchema.partial(),
  }),
  // Source Management
  z.object({
    type: z.literal("SourcesListResponse"),
    data: SourcesListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("InputListResponse"),
    data: InputListResponseDataSchema.partial(),
  }),
  // Audio Management
  z.object({
    type: z.literal("AudioMuteResponse"),
    data: AudioMuteResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("AudioVolumeResponse"),
    data: AudioVolumeResponseDataSchema.partial(),
  }),
  // Profile and Collection Management
  z.object({
    type: z.literal("ProfileListResponse"),
    data: ProfileListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("CurrentProfileResponse"),
    data: CurrentProfileResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("SceneCollectionListResponse"),
    data: SceneCollectionListResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("CurrentCollectionResponse"),
    data: CurrentCollectionResponseDataSchema.partial(),
  }),
  // Virtual Camera
  z.object({
    type: z.literal("VirtualCamStatusResponse"),
    data: VirtualCamStatusResponseDataSchema.partial(),
  }),
  // Replay Buffer
  z.object({
    type: z.literal("ReplayBufferStatusResponse"),
    data: ReplayBufferStatusResponseDataSchema.partial(),
  }),
  // Studio Mode
  z.object({
    type: z.literal("StudioModeResponse"),
    data: StudioModeResponseDataSchema.partial(),
  }),
  // Statistics
  z.object({
    type: z.literal("StatsResponse"),
    data: StatsResponseDataSchema.partial(),
  }),
  // Transitions
  z.object({
    type: z.literal("CurrentTransitionResponse"),
    data: CurrentTransitionResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("TransitionListResponse"),
    data: TransitionListResponseDataSchema.partial(),
  }),
  // Filters
  z.object({
    type: z.literal("FilterListResponse"),
    data: FilterListResponseDataSchema.partial(),
  }),
  // Hotkeys
  z.object({
    type: z.literal("HotkeyListResponse"),
    data: HotkeyListResponseDataSchema.partial(),
  }),
  // Version
  z.object({
    type: z.literal("VersionResponse"),
    data: VersionResponseDataSchema.partial(),
  }),
  // Real-time events (op: 5)
  z.object({
    type: z.literal("StreamStateChanged"),
    data: StreamStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("RecordStateChanged"),
    data: RecordStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("CurrentProgramSceneChanged"),
    data: CurrentProgramSceneChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("SceneItemEnableStateChanged"),
    data: SceneItemEnableStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("InputMuteStateChanged"),
    data: InputMuteStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("InputVolumeChanged"),
    data: InputVolumeChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("VirtualcamStateChanged"),
    data: VirtualcamStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("ReplayBufferStateChanged"),
    data: ReplayBufferStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("StudioModeStateChanged"),
    data: StudioModeStateChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("CurrentSceneTransitionChanged"),
    data: CurrentSceneTransitionChangedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("SceneTransitionStarted"),
    data: SceneTransitionStartedDataSchema.partial(),
  }),
  z.object({
    type: z.literal("SceneTransitionEnded"),
    data: SceneTransitionEndedDataSchema.partial(),
  }),
  // Generic events for unhandled cases
  z.object({
    type: z.literal("UnknownResponse"),
    data: UnknownResponseDataSchema.partial(),
  }),
  z.object({
    type: z.literal("UnknownEvent"),
    data: UnknownEventDataSchema.partial(),
  }),
  // Connection events
  z.object({ type: z.literal("Hello"), data: HelloDataSchema.partial() }),
  z.object({
    type: z.literal("Identified"),
    data: IdentifiedDataSchema.partial(),
  }),
])

export const IncomingObsEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("obs_status"),
    status: ObsEventSchema,
  }),

  z.object({
    type: z.literal("client_count"),
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
  type_id: string
  kind: string
}

export type InputInfo = {
  name: string
  kind: string
  unversioned_kind: string
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
  cpu_usage: number
  memory_usage: number
  available_disk_space: number
  active_fps: number
  average_frame_time: number
  render_total_frames: number
  render_missed_frames: number
  output_total_frames: number
  output_skipped_frames: number
  web_socket_session_incoming_messages: number
  web_socket_session_outgoing_messages: number
}

export type ClientObsState = {
  obs_version: string

  websocket_version: string

  identified: boolean

  streaming: boolean

  stream_timecode: string

  recording: boolean

  record_timecode: string

  scenes: Array<SceneInfo>

  current_scene: string

  sources: Array<SourceInfo>

  inputs: Array<InputInfo>

  audio_mutes: Record<string, boolean>

  audio_volumes: Record<string, { volume_db: number; volume_mul: number }>

  profiles: Array<string>

  current_profile: string

  collections: Array<string>

  current_collection: string

  virtual_cam_active: boolean

  replay_buffer_active: boolean

  studio_mode_enabled: boolean

  stats: ObsStats

  current_transition_name: string

  current_transition_duration: number

  transitions: Array<TransitionInfo>

  last_transition_started_name?: string

  last_transition_ended_name?: string

  source_filters: Record<string, Array<FilterInfo>>

  hotkeys: Array<HotkeyInfo>

  scene_item_enable_states: Record<string, Record<number, boolean>>

  last_unknown_response?: { request_type: string; data: unknown }

  last_unknown_event?: { event_type: string; data: unknown }
}
