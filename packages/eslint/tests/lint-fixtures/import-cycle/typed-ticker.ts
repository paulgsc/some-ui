// IC1 fixture: a type-only import back, which no runtime cycle runs through.
import type { Reading } from "@lint-fixtures/import-cycle/typed-clock"

export const typedTick = (last?: Reading): number => (last?.at ?? 0) + 1
