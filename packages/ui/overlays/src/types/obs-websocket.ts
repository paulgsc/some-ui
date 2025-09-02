import { IncomingObsEventSchema, ObsCommandSchema } from "some-types-utils"
import type { ClientObsState, ObsEvent } from "some-types-utils"
import type { z } from "zod"

export { IncomingObsEventSchema, ObsCommandSchema, ClientObsState, ObsEvent }
export type IncomingObsEvent = z.infer<typeof IncomingObsEventSchema>
export type ObsCommand = z.infer<typeof ObsCommandSchema>
