/**
 * Where Studio's time log is kept on the phone (STUDIO ST9): one
 * `localStorage` record, append-only, read and written only through
 * core-utils' `openKept` and `writeKept` (KR1). Home gets a copy
 * (www `lib/home-link/studio-log`); the phone keeps its whole log.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import { z } from "zod"

import type { TimeEvent } from "./time-log"
import { TIME_EVENT_TYPES } from "./time-log"
import { SITTING_KINDS } from "./words"

export const TIME_LOG_KEY = "some-ui:studio:time-log"

const TimeEventSchema: z.ZodType<TimeEvent> = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  at: z.string(),
  sitting: z.string().regex(/^[\w-]{1,64}$/),
  kind: z.enum(SITTING_KINDS),
  type: z.enum(TIME_EVENT_TYPES),
  screen: z
    .string()
    .regex(/^[\w.:-]{1,200}$/)
    .nullable(),
})

const isEvent = (value: unknown): value is TimeEvent =>
  TimeEventSchema.safeParse(value).success

const readLog = salvageList(isEvent)

export type TimeLogStore = {
  /** Every event kept, in the order kept; empty when none can be read. */
  read: () => ReadonlyArray<TimeEvent>
  /** Adds `events` after what is kept; false when nothing was kept. */
  append: (events: ReadonlyArray<TimeEvent>) => boolean
}

/** The log in `storage` (the page's own, looked up on each call). */
export function keptTimeLog(
  storage: () => KeyedStorage | null = localStorageOrNull
): TimeLogStore {
  const open = (): { value: ReadonlyArray<TimeEvent>; writable: boolean } =>
    openKept<ReadonlyArray<TimeEvent>>(storage(), TIME_LOG_KEY, readLog, [])
  return {
    read: (): ReadonlyArray<TimeEvent> => open().value,
    append: (events): boolean => {
      if (events.length === 0) return true
      const opened = open()
      if (!opened.writable) return false
      return writeKept(
        storage(),
        TIME_LOG_KEY,
        [...opened.value, ...events],
        readLog
      )
    },
  }
}
