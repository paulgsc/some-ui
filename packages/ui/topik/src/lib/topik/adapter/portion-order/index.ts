/**
 * The last order asked for on "What are you hungry for?" (`core/portion`),
 * kept on this device so the question screen opens on it. It is one order,
 * replaced by the next: a convenience, and no record of what was studied.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
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

/** A failed read is no order, and a failed write is lost. */
export function createPortionOrderStore(
  storage: Pick<Storage, "getItem" | "setItem"> | null = localStorageOrNull()
): PortionOrderStore {
  return {
    last: (): Order | null => {
      try {
        const parsed = OrderSchema.safeParse(
          JSON.parse(storage?.getItem(PORTION_ORDER_KEY) ?? "null")
        )
        return parsed.success
          ? { portion: parsed.data.portion, freshness: parsed.data.freshness }
          : null
      } catch {
        return null
      }
    },
    save: (order): void => {
      try {
        storage?.setItem(
          PORTION_ORDER_KEY,
          JSON.stringify({ version: 1, ...order })
        )
      } catch {
        // Ignored: quota, privacy mode: the screen opens on its default next time.
      }
    },
  }
}
