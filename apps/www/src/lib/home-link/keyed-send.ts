/**
 * One `PUT` per keyed record the voice lane carries after its notes (Studio's
 * ideas, `./ideas`, ST26; Studio's videos, `./videos`, ST33), each answer
 * read the one way home gives it for both: home names a record it took the
 * same way, refuses one whose takes it doesn't hold with a `409` naming
 * them (`FileHostError::ConflictNaming`, `details.notes`), and refuses one
 * it won't take as it is with another `409` or a `422`. This module makes
 * no request of its own (each goes through the run's `send`) and lets
 * nothing on the phone go. Home's answers:
 *
 * - `200` that the record's `kept` accepts: held;
 * - `409` naming notes: missing those takes, and sent again on a later run;
 * - `409` with no notes, or `422`: refused, said to the native log;
 * - `404`: a home that keeps none of these yet, so every one waits, said to
 *   the native log once a launch, and the run goes on to what follows;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each record still waiting.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

/** How home answered for one record. */
type KeyedAnswer =
  | { readonly kind: "held" }
  /** Home doesn't hold these takes (by voice note id). */
  | { readonly kind: "missing"; readonly notes: ReadonlyArray<string> }
  | { readonly kind: "refused" }

/** How one kind of record goes home, and where its answers are kept. */
export type KeyedSend<T> = {
  /** What one is, for a run that ends on an answer it can't read. */
  readonly what: string
  readonly path: (item: T) => string
  readonly body: (item: T) => string
  /** Whether a `200`'s body says home keeps `item` as sent. */
  readonly kept: (body: string, item: T) => boolean
  readonly answered: (item: T, answer: KeyedAnswer) => void
  /** Home didn't take `item` (`409`, `422`), or keeps none of these (`404`). */
  readonly untaken: (item: T, status: number) => void
}

/**
 * The voice notes a `409`'s body names as not held on home, or null when it
 * names none.
 */
function notesNotHeld(body: string): ReadonlyArray<string> | null {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.error)) return null
  const { details } = answer.error
  if (!isRecord(details) || !Array.isArray(details.notes)) return null
  return details.notes.filter(
    (note): note is string => typeof note === "string"
  )
}

/** Sends each of `items` in order, and says how the run ended. */
export async function sendKeyed<T>(
  items: ReadonlyArray<T>,
  how: KeyedSend<T>,
  send: HomeCall
): Promise<HomeExchanged> {
  for (const item of items) {
    const answer = await send("PUT", how.path(item), how.body(item))
    if (answer.status === 200 && how.kept(answer.body, item)) {
      how.answered(item, { kind: "held" })
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    const notes = answer.status === 409 ? notesNotHeld(answer.body) : null
    if (notes !== null) {
      how.answered(item, { kind: "missing", notes })
      continue
    }
    if (answer.status === 409 || answer.status === 422) {
      how.answered(item, { kind: "refused" })
      how.untaken(item, answer.status)
      continue
    }
    if (answer.status === 404) {
      how.untaken(item, answer.status)
      return { kind: "synced" }
    }
    return unexpectedAnswer(how.what, answer.status)
  }
  return { kind: "synced" }
}

/**
 * Says to the native log, under `port`, that home didn't take a record
 * (`key`): `refused` for a `409` or `422`, and `unkept` for a `404`, once a
 * launch, since every one after it is answered the same.
 */
export function untakenTold(
  port: string,
  summary: { readonly unkept: string; readonly refused: string }
): (key: string, status: number) => void {
  let unkeptSaid = false
  return (key, status): void => {
    if (status === 404) {
      if (unkeptSaid) return
      unkeptSaid = true
    }
    reportFailure({
      port,
      error: {
        ...toIntentError(new Error(`${key}: home answered ${String(status)}`)),
        summary: status === 404 ? summary.unkept : summary.refused,
      },
    })
  }
}
