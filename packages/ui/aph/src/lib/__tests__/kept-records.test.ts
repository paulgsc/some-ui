/**
 * @vitest-environment jsdom
 *
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over aph's two records,
 * opened and written as the store does: nothing is written after an open
 * that found the storage unreadable.
 */
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import {
  HOME_KEY,
  openHome,
  openStored,
  STORAGE_KEY,
  writeHome,
  writeStored,
} from "@aph/lib/stored"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "aph's device record",
    key: STORAGE_KEY,
    older: '{"v":0,"entries":[]}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        openStored(storage).kind !== "unreadable" &&
        writeStored(storage, {
          settings: SEED_SETTINGS,
          entries: SEED_ENTRIES.slice(0, 1),
        }),
      read: (): unknown => openStored(storage),
    }),
  },
  {
    name: "aph's home record",
    key: HOME_KEY,
    older: '{"v":0,"pending":[]}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        openHome(storage).kind !== "unreadable" &&
        writeHome(storage, {
          settings: SEED_SETTINGS,
          settingsPending: true,
          pending: [],
          refused: [],
        }),
      read: (): unknown => openHome(storage),
    }),
  },
]

describeKeptRecords(stores, () => inMemoryStorage())
