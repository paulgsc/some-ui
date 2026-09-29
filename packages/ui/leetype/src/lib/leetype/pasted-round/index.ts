/**
 * The round the learner pasted this session, and only that one.
 *
 * The same posture as TOPIK's pasted lesson (`@some-ui/topik`,
 * `lib/topik/adapter/pasted-lesson`): the learner's own model wrote it, the
 * app checked it (`lib/leetype/generation/intake`), and the app holds it in
 * `sessionStorage` for the session. It survives a reload of the tab and is
 * gone when the tab closes. The device keeps it no longer: the learner's
 * conversation with their model already holds the round, so keeping it
 * longer here buys nothing a second paste doesn't.
 *
 * It is kept longer only when the learner asks, for that round, and then on
 * their account rather than on the device: "Keep on this account" puts it
 * on the host's learner shelf (`lib/leetype/shelf`, canon Rem. 7.3), and
 * replaying a kept round puts it back in this slot. Nothing here writes to
 * the shelf by itself.
 *
 * One slot: pasting another round replaces it. It is re-checked on the way
 * out, like everything read back from storage, and every failure is silent:
 * losing it costs a paste.
 */

import { lintAuthoredRounds } from "@leetype/lib/leetype/round-assembly"
import type { Round } from "@leetype/types/authored-round"
import { RoundSchema } from "@leetype/types/authored-round"

export const PASTED_ROUND_KEY = "leetype:pasted-round"

/** The part of `Storage` this store touches, so tests can pass a fake. */
export type RoundStorage = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>

export type PastedRoundStore = {
  get(): Round | null
  /** Holds this round for the session, replacing any other. */
  set(round: Round): void
  clear(): void
}

/** `window.sessionStorage`, or null wherever touching it throws. */
function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function createPastedRoundStore(
  storage: RoundStorage | null = sessionStorageOrNull()
): PastedRoundStore {
  const write = (value: string): void => {
    try {
      storage?.setItem(PASTED_ROUND_KEY, value)
    } catch {
      // Quota or privacy mode: the round plays from memory for this visit.
      // Whatever the slot held before is removed rather than left standing,
      // or a reload would bring back the round this one replaced (the same
      // finding TOPIK's store records, #1555).
      try {
        if (storage?.removeItem) storage.removeItem(PASTED_ROUND_KEY)
        else storage?.setItem(PASTED_ROUND_KEY, "")
      } catch {
        // Storage refuses even that; there is nothing further to try.
      }
    }
  }

  return {
    get: (): Round | null => {
      try {
        const raw = storage?.getItem(PASTED_ROUND_KEY)
        if (!raw) return null
        const value: unknown = JSON.parse(raw)
        if (lintAuthoredRounds([value]).length > 0) return null
        const parsed = RoundSchema.safeParse(value)
        return parsed.success ? parsed.data : null
      } catch {
        return null
      }
    },
    set: (round): void => write(JSON.stringify(round)),
    clear: (): void => write(""),
  }
}
