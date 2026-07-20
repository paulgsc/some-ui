import type { ComponentType } from "react"
import { z } from "zod"

/**
 * A leaf id in a layout tree. Open by design - a user placing a leaf via
 * the live editor names it themselves, so the type can't pre-declare every
 * possible region up front. `YouTubeRegion` below is a known, non-exhaustive
 * subset (the built-in vocabulary the pre-built layout templates use), not
 * the full space of valid ids.
 */
export type SlotId = string

export type YouTubeRegion =
  | "video"
  | "title"
  | "mainContent"
  | "footerLeft"
  | "sidebarTop"
  | "sidebarBottom"
  | "footerRight"

// --- Base Types ---
export const TimeMsSchema = z.number().int()
export type TimeMs = z.infer<typeof TimeMsSchema>

export const LifetimeIdSchema = z.number().int().nonnegative()
export type LifetimeId = z.infer<typeof LifetimeIdSchema>

// --- Metadata & Config ---
export const ComponentPlacementSchema = z.object({
  registry_key: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
  duration: TimeMsSchema,
})

export type ComponentPlacement = z.infer<typeof ComponentPlacementSchema>

// Focus intent
export const FocusIntentSchema = z.object({
  region: z.string(),
  intensity: z.number().min(0).max(1),
})

export type FocusIntent = z.infer<typeof FocusIntentSchema>

// --- Panel intent (root of a region) ---
export const PanelIntentSchema = z.object({
  registry_key: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
  focus: FocusIntentSchema.nullable().optional(),
  children: z.array(ComponentPlacementSchema).optional(),
})

export type PanelIntent = z.infer<typeof PanelIntentSchema>

// UI Layout Intent (Server → Client contract)
export const UILayoutIntentSchema = z.object({
  panels: z.record(z.string(), PanelIntentSchema).optional(),
})

export type UILayoutIntent = z.infer<typeof UILayoutIntentSchema>

export const SceneConfigSchema = z.object({
  scene_name: z.string(),
  duration: TimeMsSchema,
  start_time: TimeMsSchema,
  ui: z.array(UILayoutIntentSchema),
})

export type SceneConfig = z.infer<typeof SceneConfigSchema>

export const OrchestratorConfigSchema = z.object({
  scenes: z.array(SceneConfigSchema),
  tick_interval_ms: z.number().int().nonnegative(),
  loop_scenes: z.boolean(),
})

// --- StreamStatus ---
export const StreamStatusSchema = z.object({
  is_streaming: z.boolean(),
  stream_time: TimeMsSchema,
  timecode: z.string(),
})

export type StreamStatus = z.infer<typeof StreamStatusSchema>

const LifetimeKindSchema = z.object({
  Scene: z.object({
    scene_id: z.string(),
    scene_name: z.string(),
    duration: TimeMsSchema,
    ui: z.array(UILayoutIntentSchema).optional(),
  }),
})

export const ActiveLifetimeSchema = z.object({
  id: LifetimeIdSchema,
  kind: LifetimeKindSchema,
  started_at: TimeMsSchema,
})

export type ActiveLifetime = z.infer<typeof ActiveLifetimeSchema>

// --- OrchestratorMode (FSM states) ---
export const OrchestratorModeSchema = z.enum([
  "Unconfigured",
  "Idle",
  "Running",
  "Paused",
  "Finished",
  "Stopped",
  "Error",
])

export type OrchestratorMode = z.infer<typeof OrchestratorModeSchema>

// --- OrchestratorState ---
export const OrchestratorStateSchema = z.object({
  mode: OrchestratorModeSchema,
  current_time: TimeMsSchema,
  total_duration: TimeMsSchema,
  progress: z.number().min(0).max(1),
  time_remaining: TimeMsSchema,
  active_lifetimes: z.array(ActiveLifetimeSchema),
  current_active_scene: z.string().nullable(),
  stream_status: StreamStatusSchema,
})

export type OrchestratorState = z.infer<typeof OrchestratorStateSchema>

// --- Commands (TickCommand equivalent) ---
export const OrchestratorCommandSchema = z.union([
  z.object({ Configure: OrchestratorConfigSchema }),
  z.object({ Start: z.null() }),
  z.object({ Pause: z.null() }),
  z.object({ Resume: z.null() }),
  z.object({ Stop: z.null() }),
  z.object({ Reset: z.null() }),
  z.object({ ForceScene: z.string() }),
  z.object({ SkipCurrentScene: z.null() }),
  z.object({ UpdateStreamStatus: StreamStatusSchema }),
])

export type OrchestratorCommand = z.infer<typeof OrchestratorCommandSchema>

// --- Events (from server) ---
export const OutgoingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("orchestratorCommandData"),
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
  mode: "Unconfigured",
  progress: 0.0,
  current_time: 0,
  time_remaining: 0,
  total_duration: 0,
  active_lifetimes: [],
  current_active_scene: null,
  stream_status: {
    is_streaming: false,
    stream_time: 0,
    timecode: "00:00:00.000",
  },
}

// Registry Entry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegistryEntry<P = any> = {
  Component: ComponentType<P>
  preload: () => Promise<{ default: ComponentType<P> }>
}

// Use a mapped type so each key 'K' can have its own internal prop type
export type ComponentRegistry<T extends string> = {
  [K in T]: RegistryEntry
}
