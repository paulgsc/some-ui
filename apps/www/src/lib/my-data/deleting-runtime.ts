/**
 * My data's delete runtime (MY-DATA MD3, #2477): owns the one delete in
 * flight and the phone's let-go after it, over ports; `./deleting`'s
 * `stepDeleting` decides which answer is stale. The page reads the snapshot
 * and calls `ask`, `confirm` and `close`.
 *
 * - **One run per confirm.** `confirm` while a delete is in flight does
 *   nothing (the step refuses it), so a second tap can't race the first.
 * - **What uses them is read again at every confirm** (INUSE, TU1), before
 *   anything is sent: a use the sheet didn't show asks again instead.
 * - **The phone lets go on home's receipt alone, whatever the sheet shows.**
 *   The let-go follows every receipt, even one whose answer the sheet no
 *   longer waits for: home has deleted the note, so this phone's copy goes
 *   too, inside the delete's run, before a drain run could send it again.
 *   Nothing home did not answer with a receipt is let go.
 * - **Then My data reads again** (`reread`) while a page of it shows, so
 *   the list no longer shows what went.
 *
 * LA19 (docs/learner-data-authority.md): `ports.deleteNotes` runs only in
 * `run`, after `stepDeleting` accepted a `confirmed` from the sheet.
 */
import type { DeleteAsked } from "@/lib/home-link/delete-note"
import type { TakeUses } from "@/lib/take-uses/model"

import type {
  DeletableKind,
  DeleteEnd,
  DeletingEvent,
  DeletingState,
} from "./deleting"
import { endOf, INITIAL_DELETING, stepDeleting } from "./deleting"

export type DeletingPorts = {
  /**
   * Asks home to delete each note for good, one run, handing what came of it
   * to `settle` inside that run; never rejects.
   */
  readonly deleteNotes: (
    ids: ReadonlyArray<string>,
    settle: (asked: DeleteAsked) => Promise<void>
  ) => Promise<DeleteAsked>
  /**
   * Lets go of this phone's own copies of `ids`, deleted on home; resolves
   * false when it couldn't, and never rejects.
   */
  readonly letGo: (
    of: DeletableKind,
    ids: ReadonlyArray<string>
  ) => Promise<boolean>
  /** Reads My data again while a page of it shows, so what went leaves it. */
  readonly reread: () => void
  /**
   * What uses each take, read now (`lib/take-uses`); never rejects, and a
   * store it couldn't read is named unread (TU1).
   */
  readonly uses: () => Promise<TakeUses>
}

export type Deleting = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => DeletingState
  /** "Delete…": opens the sheet on `ids` of kind `of`. */
  readonly ask: (of: DeletableKind, ids: ReadonlyArray<string>) => void
  /** "Delete for good", or Try again. */
  readonly confirm: () => void
  /** "Keep it", Done, or the sheet dismissed. */
  readonly close: () => void
}

export function createDeleting(ports: DeletingPorts): Deleting {
  let state = INITIAL_DELETING
  const listeners = new Set<() => void>()

  const dispatch = (event: DeletingEvent): void => {
    const next = stepDeleting(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  /** Lets go of what home deleted; whether there was anything to. */
  const letGo = async (
    seq: number,
    of: DeletableKind,
    end: DeleteEnd
  ): Promise<boolean> => {
    if (end.kind !== "answered" || end.gone.length === 0) return false
    const ids = end.gone.map((receipt) => receipt.id)
    const done = await ports.letGo(of, ids)
    dispatch({ type: "letGoEnded", seq, let: done })
    return true
  }

  const run = async (): Promise<void> => {
    const { sheet, seq } = state
    if (sheet.kind !== "deleting") return
    const went = { any: false }
    await ports.deleteNotes(sheet.ids, async (asked) => {
      const end = endOf(asked)
      dispatch({ type: "answered", seq, end })
      went.any = await letGo(seq, sheet.of, end)
    })
    // Once the delete's run has freed the link, which this read takes.
    if (went.any) ports.reread()
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    ask(of, ids): void {
      const before = state
      dispatch({ type: "asked", of, ids })
      if (state === before) return
      const { asks } = state
      void ports.uses().then((uses) => {
        dispatch({ type: "usesRead", asks, uses })
      })
    },
    confirm(): void {
      // The tap's numbers: a second tap, or one on a sheet since asked
      // again, changes nothing once the first has moved the sheet.
      const { seq, asks } = state
      void ports.uses().then((uses) => {
        const before = state
        dispatch({ type: "confirmed", seq, asks, uses })
        if (state !== before && state.sheet.kind === "deleting") void run()
      })
    },
    close(): void {
      dispatch({ type: "closed" })
    },
  }
}
