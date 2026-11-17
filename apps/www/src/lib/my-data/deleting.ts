/**
 * My data's delete of a record home keeps (MY-DATA MD3, #2477), white-gloved:
 * the sheet's states and their pure `step`, what home's answers mean, and
 * which recordings the page may offer to delete. `./deleting-runtime` owns
 * the request and the phone's let-go, and decides which answer is stale;
 * `./words`' `DELETING` says each state; the page reads the snapshot.
 *
 * - **Only what home deletes, only where the page may offer it.** My data
 *   offers a recording of any kind for deleting only when home's list marks
 *   it `deletable` (`./model`) and this phone can let go of its own copy:
 *   Studio's and the soundbites' copies only once their store is handed in
 *   (`WAITS_ON_STORE`), known only once this phone's read is in. Takes ›
 *   Needs your attention (HEARD3) lists only takes home couldn't hear, and
 *   offers it on each of a kind this build knows (HEARD4, C450; HEARD5,
 *   C460).
 * - **It asks once,** "Keep it" first: `asked` opens the sheet, `confirmed`
 *   deletes. While it deletes, the sheet can't be closed or asked again.
 * - **Home's answer is final but for silence.** A receipt (`200`) is gone
 *   for good; a `409` (home keeps it) and a `404` (home holds no such note)
 *   delete nothing and are never asked again. Only no answer, or home or
 *   this phone being busy, offers Try again, a tap, and only for the notes
 *   home didn't answer. Nothing retries on its own.
 *
 * LA19 (docs/learner-data-authority.md): `deleting` is reached only from
 * `asking` or an `ended` sheet's `retryable` notes, and `asked` only for
 * what `offersDelete` passes on My data, or `isKind` on Needs your
 * attention.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever, readAs } from "@some-ui/core-utils"
import { z } from "zod"

import type { DeleteAsked } from "@/lib/home-link/delete-note"

import type { KindItem, Of } from "./model"

/** A kind the delete path can ever delete, and its sheet name. */
export type DeletableKind = Of

/** The kinds whose copies this phone lets go only through a store a page hands in. */
const WAITS_ON_STORE: ReadonlyArray<Of> = ["studio", "soundbite"]

/**
 * Whether My data offers "Delete…" on `item` of kind `of`: home marks it
 * deletable, and this phone can let go of its own copy. `unread` names the
 * stores not handed in this run, or is null while this phone's read isn't in.
 */
export function offersDelete(
  of: Of,
  item: KindItem,
  unread: ReadonlyArray<string> | null
): boolean {
  if (!item.deletable) return false
  if (!WAITS_ON_STORE.includes(of)) return true
  return unread !== null && !unread.includes(of)
}

const ReceiptSchema = z.object({
  id: z.string(),
  // A kind a newer home deletes is still a receipt.
  of: z.string(),
  recordedAt: z.string(),
  storedAt: z.string(),
  size: z.number().int().nonnegative(),
  deletedAt: z.string(),
  went: z.array(z.string()),
  stayed: z.array(z.string()),
})

/** What home keeps of a note it deleted, as `DELETE` and the list answer it. */
export type Receipt = z.infer<typeof ReceiptSchema>

const Deleted = z.object({ receipt: ReceiptSchema })

/** What home answered a delete of one of its records with. */
export type HomeDeleteEnd<R> =
  | { readonly kind: "gone"; readonly receipt: R }
  /** `409`: home keeps it. */
  | { readonly kind: "kept" }
  /** `404`: home holds no such record, so there was nothing there to delete. */
  | { readonly kind: "notHeld" }
  /** `401`: home no longer knows this phone. */
  | { readonly kind: "forgotten" }
  /** No answer, home busy, or an answer the phone can't read. */
  | { readonly kind: "unanswered" }

/** What home's answer to a delete says, `schema` reading its receipt. */
export function readHomeDelete<R>(
  schema: z.ZodType<{ receipt: R }>,
  answer: HomeAnswer | null
): HomeDeleteEnd<R> {
  if (answer === null) return { kind: "unanswered" }
  if (answer.status === 409) return { kind: "kept" }
  if (answer.status === 404) return { kind: "notHeld" }
  if (answer.status === 401) return { kind: "forgotten" }
  if (answer.status !== 200) return { kind: "unanswered" }
  const read = readAs(schema, answer.body)
  return read === null
    ? { kind: "unanswered" }
    : { kind: "gone", receipt: read.receipt }
}

/** What home answered one note's delete with (`409`: switched off, or kept for good). */
export type NoteEnd = HomeDeleteEnd<Receipt>

/** What one note's answer from home says. */
export function readDeletion(answer: HomeAnswer | null): NoteEnd {
  return readHomeDelete(Deleted, answer)
}

/** How this phone's let-go of its own copies went, once there are receipts. */
type LetGo = "letting" | "let" | "failed"

/** How a delete ended. */
export type DeleteEnd =
  | {
      readonly kind: "answered"
      readonly gone: ReadonlyArray<Receipt>
      readonly kept: number
      readonly notHeld: number
      readonly forgotten: number
      /** The notes home didn't answer for, which Try again asks again. */
      readonly unanswered: ReadonlyArray<string>
      /** Null when nothing went. */
      readonly letGo: LetGo | null
    }
  /** Nothing was sent: the phone isn't paired. */
  | { readonly kind: "unpaired" }
  /** Nothing was sent: the phone was busy with home already. */
  | { readonly kind: "busy" }
  /** Nothing was answered. */
  | { readonly kind: "unreachable" }

/** What came of a run, as the sheet says it. */
export function endOf(asked: DeleteAsked): DeleteEnd {
  switch (asked.kind) {
    case "unpaired":
    case "busy":
    case "unreachable": {
      return { kind: asked.kind }
    }
    case "answered": {
      const gone: Array<Receipt> = []
      const unanswered: Array<string> = []
      let kept = 0
      let notHeld = 0
      let forgotten = 0
      for (const { id, answer } of asked.answers) {
        const end = readDeletion(answer)
        switch (end.kind) {
          case "gone": {
            gone.push(end.receipt)
            break
          }
          case "kept": {
            kept += 1
            break
          }
          case "notHeld": {
            notHeld += 1
            break
          }
          case "forgotten": {
            forgotten += 1
            break
          }
          case "unanswered": {
            unanswered.push(id)
            break
          }
          default: {
            return assertNever(end)
          }
        }
      }
      if (gone.length + kept + notHeld + forgotten === 0)
        return { kind: "unreachable" }
      return {
        kind: "answered",
        gone,
        kept,
        notHeld,
        forgotten,
        unanswered,
        letGo: gone.length === 0 ? null : "letting",
      }
    }
    default: {
      return assertNever(asked)
    }
  }
}

/** The notes Try again asks again, or none when the end is final. */
export function retryable(
  ids: ReadonlyArray<string>,
  end: DeleteEnd
): ReadonlyArray<string> {
  switch (end.kind) {
    case "answered": {
      return end.forgotten > 0 ? [] : end.unanswered
    }
    case "busy":
    case "unreachable": {
      return ids
    }
    case "unpaired": {
      return []
    }
    default: {
      return assertNever(end)
    }
  }
}

/** The sheet. */
export type DeleteSheet =
  | { readonly kind: "closed" }
  /** Asking once: what goes and what stays, "Keep it" first. */
  | {
      readonly kind: "asking"
      readonly of: DeletableKind
      readonly ids: ReadonlyArray<string>
    }
  | {
      readonly kind: "deleting"
      readonly of: DeletableKind
      readonly ids: ReadonlyArray<string>
    }
  | {
      readonly kind: "ended"
      readonly of: DeletableKind
      readonly ids: ReadonlyArray<string>
      readonly end: DeleteEnd
    }

export type DeletingState = {
  /** Each confirm's number: an answer to an earlier one changes nothing. */
  readonly seq: number
  readonly sheet: DeleteSheet
}

export const INITIAL_DELETING: DeletingState = {
  seq: 0,
  sheet: { kind: "closed" },
}

export type DeletingEvent =
  /** "Delete…" on one recording, or on those selected. */
  | {
      readonly type: "asked"
      readonly of: DeletableKind
      readonly ids: ReadonlyArray<string>
    }
  /** "Delete for good", or Try again. */
  | { readonly type: "confirmed" }
  | { readonly type: "answered"; readonly seq: number; readonly end: DeleteEnd }
  | { readonly type: "letGoEnded"; readonly seq: number; readonly let: boolean }
  /** "Keep it", Done, or the sheet dismissed. */
  | { readonly type: "closed" }

export function stepDeleting(
  state: DeletingState,
  event: DeletingEvent
): DeletingState {
  const { sheet } = state
  switch (event.type) {
    case "asked": {
      if (sheet.kind === "deleting" || event.ids.length === 0) return state
      return {
        ...state,
        sheet: { kind: "asking", of: event.of, ids: [...new Set(event.ids)] },
      }
    }
    case "confirmed": {
      if (sheet.kind === "asking")
        return {
          seq: state.seq + 1,
          sheet: { kind: "deleting", of: sheet.of, ids: sheet.ids },
        }
      if (sheet.kind !== "ended") return state
      const again = retryable(sheet.ids, sheet.end)
      if (again.length === 0) return state
      return {
        seq: state.seq + 1,
        sheet: { kind: "deleting", of: sheet.of, ids: again },
      }
    }
    case "answered": {
      if (sheet.kind !== "deleting" || event.seq !== state.seq) return state
      return {
        ...state,
        sheet: { kind: "ended", of: sheet.of, ids: sheet.ids, end: event.end },
      }
    }
    case "letGoEnded": {
      if (
        sheet.kind !== "ended" ||
        event.seq !== state.seq ||
        sheet.end.kind !== "answered" ||
        sheet.end.letGo !== "letting"
      )
        return state
      return {
        ...state,
        sheet: {
          ...sheet,
          end: { ...sheet.end, letGo: event.let ? "let" : "failed" },
        },
      }
    }
    case "closed": {
      if (sheet.kind === "deleting" || sheet.kind === "closed") return state
      return { ...state, sheet: { kind: "closed" } }
    }
    default: {
      return assertNever(event)
    }
  }
}

const Receipts = z.object({
  receipts: z.array(ReceiptSchema),
  total: z.number().int().nonnegative(),
})

/** What home said of its receipts, or why it said nothing. */
export type ReceiptsReading =
  | { readonly kind: "reading" }
  | { readonly kind: "unpaired" }
  | { readonly kind: "unreachable" }
  /** Home answered without this read: it runs an older version. */
  | { readonly kind: "older" }
  | {
      readonly kind: "read"
      readonly receipts: ReadonlyArray<Receipt>
      readonly total: number
    }

/** What home's answer to the read of its receipts says. */
export function readReceipts(answer: HomeAnswer): ReceiptsReading {
  // An older home has no such route: its `404`, or the `405` of the note
  // route the path also matches.
  if (answer.status === 404 || answer.status === 405) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreachable" }
  const read = readAs(Receipts, answer.body)
  return read === null
    ? { kind: "unreachable" }
    : { kind: "read", receipts: read.receipts, total: read.total }
}
