import { ClientObsState, IncomingObsEventSchema } from "some-types-utils"
import type { z } from "zod"

export { IncomingObsEventSchema, ClientObsState }
export type IncomingObsEvent = z.infer<typeof IncomingObsEventSchema>
