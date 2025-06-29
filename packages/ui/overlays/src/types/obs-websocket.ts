import { IncomingObsEventSchema } from "some-types-utils"
import type { ClientObsState, ObsEvent } from "some-types-utils"
import type { z } from "zod"

export { IncomingObsEventSchema, ClientObsState, ObsEvent }
export type IncomingObsEvent = z.infer<typeof IncomingObsEventSchema>
