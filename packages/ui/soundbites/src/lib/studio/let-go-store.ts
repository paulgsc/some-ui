/**
 * Where the owner's choice of when a take home holds leaves the phone is
 * kept (HF11, #2401; `lib/project/let-go.ts`): one `localStorage` record,
 * append-only, read and written only through core-utils' `openKept` and
 * `writeKept` (KR1). Each choice is kept with when it was made, and the
 * last one is in force, so changing it loses none made before.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import type { LetGo, LetGoChoice } from "@soundbites/lib/project/let-go"
import { LET_GO_CHOICES } from "@soundbites/lib/project/let-go"
import { z } from "zod"

export const LET_GO_KEY = "some-ui:studio:let-go"

/** One choice, as the owner made it. */
type LetGoMade = { readonly letGo: LetGo; readonly at: string }

const LetGoMadeSchema: z.ZodType<LetGoMade> = z.object({
  letGo: z.enum(LET_GO_CHOICES),
  at: z.string(),
})

const isMade = (value: unknown): value is LetGoMade =>
  LetGoMadeSchema.safeParse(value).success

const readChoices = salvageList(isMade)

export type LetGoStore = {
  /** The choice in force: the last one kept, or null before any is. */
  read: () => LetGoChoice
  /** Keeps `letGo` as made at `at`, after what is kept; false when it wasn't kept. */
  choose: (letGo: LetGo, at: string) => boolean
}

/** The choices in `storage` (the page's own, looked up on each call). */
export function keptLetGo(
  storage: () => KeyedStorage | null = localStorageOrNull
): LetGoStore {
  const open = (): {
    value: ReadonlyArray<LetGoMade>
    writable: boolean
  } =>
    openKept<ReadonlyArray<LetGoMade>>(storage(), LET_GO_KEY, readChoices, [])
  return {
    read: (): LetGoChoice => open().value.at(-1)?.letGo ?? null,
    choose: (letGo, at): boolean => {
      const opened = open()
      if (!opened.writable) return false
      return writeKept(
        storage(),
        LET_GO_KEY,
        [...opened.value, { letGo, at }],
        readChoices
      )
    },
  }
}
