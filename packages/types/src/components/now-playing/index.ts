import { z } from "zod"

export const NowPlayingEventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "tabMetaData",
])

const NowPlayingSchema = z.object({
  title: z.string().optional(),
  channel: z.string().optional(),
  video_id: z.string().optional(),
  current_time: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  thumbnail: z.string().optional(),
})

export type NowPlayingType = z.infer<typeof NowPlayingSchema>

export const IncomingNowPlayingEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(NowPlayingSchema),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    event_types: z.array(NowPlayingSchema),
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

export type IncomingNowPlayingEvent = z.infer<
  typeof IncomingNowPlayingEventSchema
>

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
