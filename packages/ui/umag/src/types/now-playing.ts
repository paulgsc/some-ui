import { z } from "zod"

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
