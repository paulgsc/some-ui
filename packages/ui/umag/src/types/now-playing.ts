import { z } from "zod"

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

export type NowPlayingType = z.infer<typeof NowPlayingSchema>

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
    type: z.literal("tabMetaData"),
    data: NowPlayingSchema,
  }),
])

export type IncomingEvent = z.infer<typeof EventSchema>

export type WsEvents = z.infer<typeof EventSchema>
