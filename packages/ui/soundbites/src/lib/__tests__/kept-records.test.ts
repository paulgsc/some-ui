/**
 * @vitest-environment jsdom
 *
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over soundbites' records
 * in the page's storage: Studio's caught ideas (ST18) and its time log (ST9).
 * Takes and projects are kept in IndexedDB, under their own rules
 * (`project/store`).
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"
import { newIdea } from "@soundbites/lib/idea/model"
import { IDEAS_KEY, keptIdeaStore } from "@soundbites/lib/idea/store"
import type { TimeEvent } from "@soundbites/lib/studio/time-log"
import { keptTimeLog, TIME_LOG_KEY } from "@soundbites/lib/studio/time-store"

const AT = "2026-10-30T10:00:00.000Z"

const opened = (id: string): TimeEvent => ({
  id,
  at: AT,
  sitting: "s1-20261030T100000000Z",
  kind: "record",
  type: "sitting_opened",
  screen: null,
})

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "Studio's time log",
    key: TIME_LOG_KEY,
    older: '{"events":[]}',
    partly: JSON.stringify([opened("e1"), { id: "e2" }]),
    open: (storage): KeptHandle => {
      const log = keptTimeLog(() => storage)
      return {
        write: (): unknown => log.append([opened(`e${log.read().length + 1}`)]),
        read: (): unknown => log.read(),
      }
    },
  },
  {
    name: "Studio's caught ideas",
    key: IDEAS_KEY,
    older: '{"ideas":[]}',
    partly: JSON.stringify([
      newIdea("idea-1", AT, "what", [{ at: AT, how: "typed", words: "x" }]),
      { id: "idea-2" },
    ]),
    open: (storage): KeptHandle => {
      const store = keptIdeaStore(() => storage)
      return {
        write: (): unknown =>
          store.keep((ideas) => [
            ...ideas,
            newIdea(`idea-${ideas.length + 1}`, AT, "what", [
              { at: AT, how: "heard", words: "a short" },
            ]),
          ]),
        read: (): unknown => store.list(),
      }
    },
  },
]

describeKeptRecords(stores, () => inMemoryStorage())
