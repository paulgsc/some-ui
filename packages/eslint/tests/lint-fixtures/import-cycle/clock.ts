// IC1 fixture: half of a two-module runtime cycle, through a path alias.
import { tick } from "@lint-fixtures/import-cycle/ticker"

export const now = (): number => tick()
