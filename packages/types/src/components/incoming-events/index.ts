import { NowPlayingSchema } from "@types-utils/components/now-playing"
import { ObsEventSchema } from "@types-utils/components/obs-websocket"
import { OrchestratorStateSchema } from "@types-utils/components/orchestrator-types"
import { UtteranceMetadataSchema } from "@types-utils/components/utterance"
import { z } from "zod"

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
