import { z } from "zod"

export const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "obsStatus",
  "tabMetaData",
])

// Schema for `NowPlaying` struct
export const NowPlayingSchema = z.object({
  title: z.string().optional(),
  channel: z.string().optional(),
  video_id: z.string().optional(),
  current_time: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  thumbnail: z.string().optional(),
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
    type: z.literal("clientCount"),
    count: z.number().nonnegative(),
  }),

  z.object({
    type: z.literal("tabMetaData"),
    data: NowPlayingSchema,
  }),
])

export type IncomingEvent = z.infer<typeof EventSchema>

export type WsEvents = z.infer<typeof EventSchema>
