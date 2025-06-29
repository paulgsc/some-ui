import { z } from "zod"

type ObsStats = {
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

export type ObsStatus = {
  streaming: boolean
  recording: boolean
  streamTimecode: string
  recordingTimecode: string
  scenes: Array<string>
  currentScene: string
  sources: Array<string>
  inputs: Array<string>
  virtualCamera: boolean
  replayBuffer: boolean
  studioMode: boolean
  currentProfile: string
  currentCollection: string
  currentTransition: string
  version: string
  stats: ObsStats
}

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

export const ObsStatusSchema = z.object({
  streaming: z.boolean(),
  recording: z.boolean(),
  streamTimecode: z.string(),
  recordingTimecode: z.string(),
  scenes: z.array(z.string()),
  currentScene: z.string(),
  sources: z.array(z.string()),
  inputs: z.array(z.string()),
  virtualCamera: z.boolean(),
  replayBuffer: z.boolean(),
  studioMode: z.boolean(),
  currentProfile: z.string(),
  currentCollection: z.string(),
  currentTransition: z.string(),
  version: z.string(),
  stats: ObsStatsSchema,
})
