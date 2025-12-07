import { z } from "zod"

// --- Base Types ---
export type TimeMs = number
export type SceneId = string

export const SceneMetadataSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
  })
  .catchall(z.unknown()) // additional arbitrary keys allowed

// --- SceneConfig ---
export const SceneConfigSchema = z.object({
  scene_name: z.string(),
  duration: z.number().int().positive(),
  metadata: SceneMetadataSchema.optional(),
})

export type SceneConfig = z.infer<typeof SceneConfigSchema>

// --- StreamStatus ---
export const StreamStatusSchema = z.object({
  is_streaming: z.boolean(),
  stream_time: z.number().int().nonnegative(),
  timecode: z.string(),
})

export type StreamStatus = z.infer<typeof StreamStatusSchema>

export const ScheduledElementSchema = z.object({
  id: z.string(),
  scene_name: z.string(),
  start_time: z.number().int().nonnegative(),
  end_time: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  is_active: z.boolean(),
  metadata: SceneMetadataSchema.optional(),
})

export type ScheduledElement = z.infer<typeof ScheduledElementSchema>

// --- OrchestratorState ---
export const OrchestratorStateSchema = z.object({
  is_running: z.boolean(),
  is_paused: z.boolean(),
  current_active_scene: z.string().nullable(),
  current_scene_index: z.number().int(),
  progress: z.number().min(0).max(1),
  current_time: z.number().int().nonnegative(),
  time_remaining: z.number().int().nonnegative(),
  active_elements: z.array(z.string()),
  scheduled_elements: z.array(ScheduledElementSchema),
  scenes: z.array(SceneConfigSchema),
  total_duration: z.number().int().nonnegative(),
  stream_status: StreamStatusSchema,
})

export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>

// --- Commands (TickCommand equivalent) ---
export const OrchestratorCommandSchema = z.union([
  z.object({
    Start: z
      .union([
        z.object({
          scenes: z.array(SceneConfigSchema),
          tick_interval_ms: z.number().int().nonnegative().optional(),
          loop_scenes: z.boolean().optional(),
          stream_grace_period_ms: z.number().int().nonnegative().optional(),
        }),
        z.string(),
        z.null(),
      ])
      .optional(),
  }),

  z.object({ Stop: z.null() }),

  z.object({ Pause: z.null() }),

  z.object({ Resume: z.null() }),

  z.object({ Reset: z.null() }),

  z.object({ ForceScene: z.string() }),

  z.object({ SkipCurrentScene: z.null() }),

  z.object({
    UpdateStreamStatus: z.object({
      is_streaming: z.boolean(),
      stream_time: z.number().int(),
      timecode: z.string(),
    }),
  }),

  z.object({
    Reconfigure: z.object({
      scenes: z.array(SceneConfigSchema),
      tick_interval_ms: z.number().int().nonnegative().optional(),
      loopScenes: z.boolean().optional(),
      stream_grace_period_ms: z.number().int().nonnegative().optional(),
    }),
  }),
])

export type OrchestratorCommand = z.infer<typeof OrchestratorCommandSchema>

// --- Events (from server) ---
export const IncomingOrchestratorEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("orchestratorState"),
    stream_id: z.string(),
    state: OrchestratorStateSchema,
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

export type IncomingOrchestratorEvent = z.infer<
  typeof IncomingOrchestratorEventSchema
>

export const OutgoingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("tickCommand"),
    stream_id: z.string(),
    command: OrchestratorCommandSchema,
  }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(z.string()).optional(),
  }),
])

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

export const defaultOrchestratorState: OrchestratorState = {
  is_running: false,
  is_paused: false,
  current_active_scene: null,
  current_scene_index: -1,
  progress: 0.0,
  current_time: 0,
  time_remaining: 0,
  active_elements: [],
  scheduled_elements: [],
  scenes: [],
  total_duration: 0,
  stream_status: {
    is_streaming: false,
    stream_time: 0,
    timecode: "00:00:00.000",
  },
}
