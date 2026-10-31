/**
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over Rust Rounds' three
 * records, opened and written as the session does: the log (appended to
 * what is stored), what plays, and the card left on screen.
 */
import { NOTHING_HELD } from "@rust-rounds/lib/play/held"
import type { Place } from "@rust-rounds/lib/play/store"
import {
  HELD_KEY,
  keptRounds,
  LOG_KEY,
  PLACE_KEY,
} from "@rust-rounds/lib/play/store"
import { INDEXING_01 } from "@rust-rounds/lib/worked-example"
import { WORKED_LOG } from "@rust-rounds/lib/worked-example/fixture"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"

const PLACE: Place = {
  visit: {
    round: INDEXING_01.id,
    card: "b",
    stage: "speak",
    picked: "Prints 122",
    note: null,
    shown: false,
    pinned: false,
    again: "fresh",
  },
  menu: null,
  title: { concept: "indexing", number: 2 },
}

const [event] = WORKED_LOG.sessions[0]?.cards ?? []

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "the Rust Rounds log",
    key: LOG_KEY,
    older: '{"schema":"some-ui.rust-round-log/0","sessions":[]}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        event !== undefined &&
        keptRounds(storage).append(
          { id: "s", startedAt: "2026-10-30T19:00:00Z" },
          { kind: "card", event, guessedWrong: false }
        ),
      read: (): unknown => keptRounds(storage).open().log,
    }),
  },
  {
    name: "the rounds Rust Rounds holds",
    key: HELD_KEY,
    older: '{"rounds":[]}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        keptRounds(storage).hold({
          ...NOTHING_HELD,
          rounds: [{ ...INDEXING_01, id: "indexing-02" }],
        }),
      read: (): unknown => keptRounds(storage).open().held,
    }),
  },
  {
    name: "the Rust Rounds card left on screen",
    key: PLACE_KEY,
    older: '{"v":1,"visit":{"round":"indexing-01","card":"b"}}',
    open: (storage): KeptHandle => ({
      write: (): unknown => keptRounds(storage).place(PLACE, []),
      read: (): unknown => {
        const { place, pending } = keptRounds(storage).open()
        return { place, pending }
      },
    }),
  },
]

describeKeptRecords(stores, () => inMemoryStorage())
