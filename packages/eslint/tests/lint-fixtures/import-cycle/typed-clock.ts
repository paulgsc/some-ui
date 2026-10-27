// IC1 fixture: a value edge whose back edge is type-only, so no runtime cycle.
import { typedTick } from "@lint-fixtures/import-cycle/typed-ticker"

export type Reading = { at: number }

export const read = (): Reading => ({ at: typedTick() })
