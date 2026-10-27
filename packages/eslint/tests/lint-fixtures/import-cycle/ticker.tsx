// IC1 fixture: the other half; this import closes the cycle.
import { now } from "@lint-fixtures/import-cycle/clock"

export const tick = (): number => now() + 1
