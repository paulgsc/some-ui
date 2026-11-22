/**
 * Where the Asks page keeps each ask's receipt (`./receipt`) while the
 * owner works through it (C1096): the tab's `sessionStorage`, so a reload
 * keeps the place and closing the tab lets it go. A receipt is a draft of
 * what the owner hands a session by copying it; the record is that session
 * and the ask's issue, so nothing here is sent or kept longer. What was
 * pasted is blanked before it is kept. A store a write is refused by (a
 * full quota) keeps the receipt for the page's life.
 *
 * Read by `useSyncExternalStore`: `subscribe`, `getSnapshot`.
 */
import type { KeyedStorage, Salvaged } from "@some-ui/core-utils"
import {
  jsonOf,
  openKept,
  sessionStorageOrNull,
  writeKept,
} from "@some-ui/core-utils"
import type { AskFile } from "@some-ui/video-render"
import { z } from "zod"

import type { Receipt, ReceiptEvent } from "./receipt"
import { appended, EntrySchema } from "./receipt"

const KEY = "some-ui:ask-receipts"

const KeptSchema = z.record(z.string(), z.array(EntrySchema))

/** Every ask's receipt, by its id (`askId`). */
type Receipts = ReadonlyMap<string, Receipt>

export type KeptReceipts = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => Receipts
  /** Appends `event` to `id`'s receipt, as `appended` says. */
  readonly append: (id: string, ask: AskFile, event: ReceiptEvent) => void
}

/** What is kept, read whole or not at all (`openKept` moves it aside). */
function readKept(raw: string): Salvaged<Receipts> | null {
  const parsed = KeptSchema.safeParse(jsonOf(raw))
  return parsed.success
    ? { value: new Map(Object.entries(parsed.data)), whole: true }
    : null
}

/** The receipts kept in `storage`. */
export function keptReceipts(storage: KeyedStorage | null): KeptReceipts {
  let receipts: Receipts = openKept(storage, KEY, readKept, new Map()).value
  const listeners = new Set<() => void>()
  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => receipts,
    append(id, ask, event): void {
      const before = receipts.get(id) ?? []
      const after = appended(before, ask, event)
      if (after === before) return
      receipts = new Map(receipts).set(id, after)
      // A refused write (a full quota) keeps the receipt for the page's
      // life, as said above.
      writeKept(storage, KEY, Object.fromEntries(receipts), readKept)
      for (const listener of listeners) listener()
    },
  }
}

/** The page's receipts, in this tab's `sessionStorage`. */
export const tabReceipts: KeptReceipts = keptReceipts(sessionStorageOrNull())
