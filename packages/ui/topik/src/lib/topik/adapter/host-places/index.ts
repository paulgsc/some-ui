/**
 * What topik keeps with the session it plays in (`ActivityHost`'s `recall`
 * and `keep`, `@some-ui/react-hooks`), so the player reopened on its scene
 * goes on where the learner was (promise SS2): the drill open in the
 * handheld lesson, and the read-aloud sitting under way. What comes back
 * from the host is unvalidated, so each is read through its own guard.
 */

import type { SetPractice } from "@topik/lib/topik/read-aloud/content"
import { SET_PRACTICES } from "@topik/lib/topik/read-aloud/content"

/** The handheld lesson's open drill. */
export const READING_PLACE = "topik:reading"
/** The read-aloud sitting under way (`set-machine`'s `SittingPlace`). */
export const SITTING_PLACE = "topik:sitting"

/**
 * The read-aloud drill the handheld lesson has open: `set` is the added set
 * it reads on its own, or null for every word the phone has. `lines`: a
 * bite or a snack, read from those lines of the set alone. `practice`: the
 * session it opens on, where the set serves both.
 */
export type Reading = {
  set: string | null
  begin?: boolean
  lines?: ReadonlyArray<string>
  practice?: SetPractice
}

const field = (value: object, key: string): unknown => Reflect.get(value, key)

/** `value` as an open drill, or null when it is none (or nothing was kept). */
export function readingOf(value: unknown): Reading | null {
  if (typeof value !== "object" || value === null) return null
  const set = field(value, "set")
  const begin = field(value, "begin")
  const lines = field(value, "lines")
  const practice = field(value, "practice")
  if (set !== null && typeof set !== "string") return null
  if (begin !== undefined && typeof begin !== "boolean") return null
  if (
    lines !== undefined &&
    !(Array.isArray(lines) && lines.every((id) => typeof id === "string"))
  ) {
    return null
  }
  const known = SET_PRACTICES.find((one) => one === practice)
  if (practice !== undefined && known === undefined) return null
  return {
    set,
    ...(begin === undefined ? {} : { begin }),
    ...(Array.isArray(lines) ? { lines: lines.map(String) } : {}),
    ...(known === undefined ? {} : { practice: known }),
  }
}
