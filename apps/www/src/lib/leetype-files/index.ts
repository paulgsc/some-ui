/**
 * The phone's LeetType session files (`@some-ui/leetype`'s session-file
 * pick, canon Rem. 11.7): the store the picker card keeps a picked file in,
 * over the device backend's content store (`keepSessionFile`). No route
 * serves these: `file_host` has none, and the device serves only what
 * `file_host` serves (`device-backend/__tests__/conformance.test.ts`), so
 * this reaches the database directly, as the sync from home does.
 *
 * A keep is `budgeted`: past the phone's storage budget it is refused
 * (`"full"`), not written. It does not raise the app's make-room prompt,
 * which offers to remove a finished session: the record is never spent to
 * hold a copy of a file Drive keeps.
 *
 * Phone-only (`build.paths.ts`).
 */
import type { KeepOutcome, SessionFileStore } from "@some-ui/leetype"

import { deviceBackend } from "@/lib/device-backend/boot"
import {
  keepSessionFile,
  listSessionFiles,
  readSessionFile,
} from "@/lib/device-backend/content-store"
import { budgetedDriver, OverBudgetError } from "@/lib/device-backend/storage"
import { deviceStorage } from "@/lib/device-backend/storage-view"

export function phoneSessionFiles(): SessionFileStore {
  return {
    list: async () => listSessionFiles((await deviceBackend()).context.db),
    keep: async (file, at): Promise<KeepOutcome> => {
      const { context } = await deviceBackend()
      try {
        const outcome = await keepSessionFile(
          budgetedDriver(context.db, context.budget),
          file,
          at.getTime()
        )
        if (outcome === "kept") void deviceStorage.refresh()
        return outcome
      } catch (error) {
        if (error instanceof OverBudgetError) return "full"
        throw error
      }
    },
    read: async (name) =>
      readSessionFile((await deviceBackend()).context.db, name),
  }
}
