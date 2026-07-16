import { z } from "zod"

import { NowPlayingSchema } from "../now-playing"
import { ObsEventSchema } from "../obs-websocket"
import { OrchestratorStateSchema } from "../orchestrator-types"
import { UtteranceMetadataSchema } from "../utterance"

export const IncomingEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(NowPlayingSchema),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    event_types: z.array(NowPlayingSchema),
  }),
  z.object({
    type: z.literal("tabMetaData"),
    data: NowPlayingSchema,
  }),
  z.object({
    type: z.literal("orchestratorState"),
    stream_id: z.string(),
    state: OrchestratorStateSchema,
  }),
  z.object({
    type: z.literal("obsStatus"),
    status: ObsEventSchema,
  }),
  z.object({
    type: z.literal("utterance"),
    text: z.string(),
    metadata: UtteranceMetadataSchema,
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

export type IncomingEvent = z.infer<typeof IncomingEventSchema>
