import { z } from "zod"

export const NowPlayingEventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "tabMetaData",
])

export const NowPlayingSchema = z.object({
  title: z.string().optional(),
  channel: z.string().optional(),
  video_id: z.string().optional(),
  current_time: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  thumbnail: z.string().optional(),
})

export type NowPlayingType = z.infer<typeof NowPlayingSchema>

export const OutgoingNowPlayingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(NowPlayingSchema),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    event_types: z.array(NowPlayingSchema),
  }),
])

export type OutgoingNowPlayingEvent = z.infer<
  typeof OutgoingNowPlayingEventSchema
>
