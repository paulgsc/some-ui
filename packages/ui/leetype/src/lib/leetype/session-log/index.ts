import type { KeyedStorage } from "@some-ui/core-utils"
import { localStorageOrNull } from "@some-ui/core-utils"

import type { SessionEvent, SessionLog } from "./model"
import { append } from "./model"
import { openStored, writeStored } from "./stored"

export type { SessionEvent, SessionLedger, SessionLog } from "./model"
export { ledgerOf } from "./model"

/**
 * The session log on the device (`./model`, `./stored`): a snapshot to read,
 * a subscription, and `append`, the only write. It opens read-only when the
 * storage threw, and an append the device refuses leaves the snapshot as it
 * was, so nothing is shown that was not kept.
 */
export type SessionLogStore = {
  getSnapshot(): SessionLog
  subscribe(listener: () => void): () => void
  readOnly: boolean
  /** Whether the event is now kept (also when it already was). */
  append(event: SessionEvent): boolean
}

export function createSessionLogStore(
  storage: KeyedStorage | null = localStorageOrNull()
): SessionLogStore {
  const opened = storage ? openStored(storage) : { kind: "unreadable" as const }
  const write =
    storage && opened.kind !== "unreadable"
      ? (next: SessionLog): boolean => writeStored(storage, next)
      : null
  let log: SessionLog = opened.kind === "kept" ? opened.log : []
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => log,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => void listeners.delete(listener)
    },
    readOnly: write === null,
    append: (event): boolean => {
      const next = append(log, event)
      if (next === log) return true
      if (!write?.(next)) return false
      log = next
      for (const listener of listeners) listener()
      return true
    },
  }
}
