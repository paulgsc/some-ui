import type { KeyedStorage } from "@some-ui/core-utils"
import { localStorageOrNull } from "@some-ui/core-utils"

import type { SessionEvent, SessionLog } from "./model"
import { SessionEventSchema } from "./model"
import { appendStored, openStored } from "./stored"

export type {
  SessionEvent,
  SessionLedger,
  SessionLog,
  SessionSummary,
} from "./model"
export { ledgerOf, summariesOf } from "./model"
export type { HomeEvent, HomeSession } from "./home"
export { finishedSessions } from "./home"

/**
 * The session log on the device (`./model`, `./stored`): a snapshot to read,
 * a subscription, and `append`, the only write. It opens read-only when the
 * storage threw. An append the device refuses leaves the log as it was and
 * says so in `problem` until an append is kept, so nothing is shown that
 * was not kept and no refusal passes unseen. The snapshot is what was kept
 * when the store opened plus this store's own appends; one store serves the
 * app, and another's appends to other sessions show from the next open.
 * Each kept event is also told to `onSessionLogged`'s listeners, whichever
 * store kept it.
 */
export type SessionLogSnapshot = {
  readonly log: SessionLog
  readonly problem: string | null
}

/** Those told of each event a store on this page keeps (www's drain, to send a finished session). */
const logged = new Set<(event: SessionEvent) => void>()

/**
 * Calls `listener` with each event any store on this page keeps, after it
 * is kept. Returns an unsubscribe.
 */
export function onSessionLogged(
  listener: (event: SessionEvent) => void
): () => void {
  logged.add(listener)
  return (): void => {
    logged.delete(listener)
  }
}

export type SessionLogStore = {
  getSnapshot(): SessionLogSnapshot
  subscribe(listener: () => void): () => void
  readOnly: boolean
  /** Whether the event is now kept (also when it already was). */
  append(event: SessionEvent): boolean
}

export function createSessionLogStore(
  storage: KeyedStorage | null = localStorageOrNull()
): SessionLogStore {
  const opened = storage ? openStored(storage) : null
  const sessions = new Map(opened ?? [])
  const writable = opened === null ? null : storage
  let snapshot: SessionLogSnapshot = {
    log: [...sessions.values()].flat(),
    problem: null,
  }
  const listeners = new Set<() => void>()
  const publish = (next: SessionLogSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => void listeners.delete(listener)
    },
    readOnly: writable === null,
    append: (event): boolean => {
      const refuse = (problem: string): false => {
        publish({ log: snapshot.log, problem })
        return false
      }
      if (writable === null) {
        return refuse(
          "This phone can't read its session log, so it isn't adding to it."
        )
      }
      if (!SessionEventSchema.safeParse(event).success) {
        return refuse(
          "That step of the session isn't one the log can keep, so it wasn't kept."
        )
      }
      const events = appendStored(writable, event)
      if (events === null) {
        return refuse(
          "This phone couldn't keep that step of the session. If it's full, free some space and try again."
        )
      }
      sessions.set(event.session, events)
      publish({ log: [...sessions.values()].flat(), problem: null })
      for (const listener of logged) listener(event)
      return true
    },
  }
}
