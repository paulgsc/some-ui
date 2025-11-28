import { z } from "zod"

// --- Base Types ---
export type TimeMs = number
export type SceneId = string

// --- SceneConfig ---
export const SceneConfigSchema = z.object({
  sceneName: z.string(),
  duration: z.number().int().positive(),
})

export type SceneConfig = z.infer<typeof SceneConfigSchema>

// --- StreamStatus ---
export const StreamStatusSchema = z.object({
  isStreaming: z.boolean(),
  streamTime: z.number().int().nonnegative(),
  timecode: z.string(),
})

export type StreamStatus = z.infer<typeof StreamStatusSchema>

// --- ScheduledElement ---
export const ScheduledElementSchema = z.object({
  id: z.string(),
  sceneName: z.string(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  isActive: z.boolean(),
})

export type ScheduledElement = z.infer<typeof ScheduledElementSchema>

// --- OrchestratorState ---
export const OrchestratorStateSchema = z.object({
  isRunning: z.boolean(),
  isPaused: z.boolean(),
  currentActiveScene: z.string().nullable(),
  currentSceneIndex: z.number().int(),
  progress: z.number().min(0).max(1),
  currentTime: z.number().int().nonnegative(),
  timeRemaining: z.number().int().nonnegative(),
  activeElements: z.array(z.string()),
  scheduledElements: z.array(ScheduledElementSchema),
  scenes: z.array(SceneConfigSchema),
  totalDuration: z.number().int().nonnegative(),
  streamStatus: StreamStatusSchema,
})

export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>

// --- Commands (TickCommand equivalent) ---
export const OrchestratorCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    config: z
      .object({
        scenes: z.array(SceneConfigSchema),
        tickIntervalMs: z.number().int().nonnegative().optional(),
        loopScenes: z.boolean().optional(),
        streamGracePeriodMs: z.number().int().nonnegative().optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("forceScene"), scene: z.string() }),
  z.object({ type: z.literal("skipCurrentScene") }),
  z.object({
    type: z.literal("updateStreamStatus"),
    isStreaming: z.boolean(),
    streamTime: z.number().int(),
    timecode: z.string(),
  }),
  z.object({
    type: z.literal("reconfigure"),
    config: z.object({
      scenes: z.array(SceneConfigSchema),
      tickIntervalMs: z.number().int().nonnegative().optional(),
      loopScenes: z.boolean().optional(),
      streamGracePeriodMs: z.number().int().nonnegative().optional(),
    }),
  }),
])

export type OrchestratorCommand = z.infer<typeof OrchestratorCommandSchema>

// --- Events (from server) ---
export const IncomingOrchestratorEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("orchestratorState"),
    streamId: z.string(),
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
  z.object({ type: z.literal("command"), cmd: OrchestratorCommandSchema }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(z.string()).optional(),
  }),
])

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

export const defaultOrchestratorState: OrchestratorState = {
  isRunning: false,
  isPaused: false,
  currentActiveScene: null,
  currentSceneIndex: -1,
  progress: 0.0,
  currentTime: 0,
  timeRemaining: 0,
  activeElements: [],
  scheduledElements: [],
  scenes: [],
  totalDuration: 0,
  streamStatus: {
    isStreaming: false,
    streamTime: 0,
    timecode: "00:00:00.000",
  },
}
