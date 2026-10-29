/**
 * The last order asked for on "What are you hungry for?" (`core/portion`),
 * kept on this device so the question screen opens on it. It is one order,
 * replaced by the next: a convenience, and no record of what was studied.
 */

import type { Kept, KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"
import type { Order } from "@topik/lib/topik/core/portion"
import { FRESHNESS, PORTIONS } from "@topik/lib/topik/core/portion"
import { z } from "zod"

const PORTION_ORDER_KEY = "topik:portion-order"

const OrderSchema = z.object({
  version: z.literal(1),
  portion: z.enum(PORTIONS),
  freshness: z.enum(FRESHNESS),
})

export type PortionOrderStore = {
  last: () => Order | null
  save: (order: Order) => void
}

const readOrder = readJson((value): Order | null => {
  const parsed = OrderSchema.safeParse(value)
  return parsed.success
    ? { portion: parsed.data.portion, freshness: parsed.data.freshness }
    : null
})

/**
 * A failed read is no order (one it cannot read is copied aside first), and
 * a failed write is lost: the screen opens on its default next time.
 */
export function createPortionOrderStore(
  storage: KeyedStorage | null = localStorageOrNull()
): PortionOrderStore {
  const open = (): Kept<Order | null> =>
    openKept<Order | null>(storage, PORTION_ORDER_KEY, readOrder, null)
  return {
    last: (): Order | null => open().value,
    save: (order): void => {
      writeKept(storage, PORTION_ORDER_KEY, { version: 1, ...order }, readOrder)
    },
  }
}
