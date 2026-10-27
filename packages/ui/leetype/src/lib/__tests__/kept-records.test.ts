/**
 * @vitest-environment jsdom
 *
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over LeetType's kept
 * stores: the typing baseline, and the session log's index and sessions.
 */
import { loadBaseline, saveBaseline } from "@leetype/lib/leetype/baseline-store"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import { INDEX_KEY, sessionKey } from "@leetype/lib/leetype/session-log/stored"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"

const STARTED = {
  session: "lt-1",
  at: "2026-10-26T09:00:00.000Z",
  id: "lt-e1",
  type: "started",
  file: "t1-01",
  form: "full",
  declaredMinutes: 10,
} as const

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "the typing baseline",
    key: "leetyping_progress",
    older: '{"version":1,"wpm":40}',
    open: (): KeptHandle => ({
      write: (): void => {
        saveBaseline({ wpm: 52, dispersion: 9, samples: 3, updatedAt: 1 })
      },
      read: (): unknown => loadBaseline(),
    }),
  },
  {
    name: "the session log's index",
    key: INDEX_KEY,
    older: '{"v":0,"sessions":["lt-1"]}',
    refusesUnreadable:
      "moving the index aside would hide every session it lists, so the log opens read-only",
    open: (storage): KeptHandle => {
      const log = createSessionLogStore(storage)
      return {
        write: (): unknown => log.append(STARTED),
        read: (): unknown => log.getSnapshot().log,
      }
    },
  },
  {
    name: "a session in the log",
    key: sessionKey("lt-1"),
    older: '{"v":0,"events":[]}',
    open: (storage): KeptHandle => {
      const log = createSessionLogStore(storage)
      return {
        write: (): unknown => log.append(STARTED),
        read: (): unknown => log.getSnapshot().log,
      }
    },
  },
]

describeKeptRecords(stores, () => inMemoryStorage())
