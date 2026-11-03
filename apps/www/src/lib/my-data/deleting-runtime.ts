/**
 * My data's delete runtime (MY-DATA MD3, #2477): owns the one delete in
 * flight and the phone's let-go after it, over ports; `./deleting`'s
 * `stepDeleting` decides which answer is stale. The page reads the snapshot
 * and calls `ask`, `confirm` and `close`.
 *
 * - **One run per confirm.** `confirm` while a delete is in flight does
 *   nothing (the step refuses it), so a second tap can't race the first.
 * - **The phone lets go on home's receipt alone, whatever the sheet shows.**
 *   The let-go follows every receipt, even one whose answer the sheet no
 *   longer waits for: home has deleted the note, so this phone's copy goes
 *   too. Nothing home did not answer with a receipt is let go.
 * - **Then My data reads again** (`reread`) while a page of it shows, so
 *   the list no longer shows what went.
 */
import type { DeleteAsked } from "@/lib/home-link/delete-note"

import type {
  DeletableKind,
  DeleteEnd,
  DeletingEvent,
  DeletingState,
} from "./deleting"
import { endOf, INITIAL_DELETING, stepDeleting } from "./deleting"

export type DeletingPorts = {
  /** Asks home to delete each note for good, one run; never rejects. */
  readonly deleteNotes: (ids: ReadonlyArray<string>) => Promise<DeleteAsked>
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

  const letGo = async (
    seq: number,
    of: DeletableKind,
    end: DeleteEnd
  ): Promise<void> => {
    if (end.kind !== "answered" || end.gone.length === 0) return
    const ids = end.gone.map((receipt) => receipt.id)
    const done = await ports.letGo(of, ids)
    dispatch({ type: "letGoEnded", seq, let: done })
    ports.reread()
  }

  const run = async (): Promise<void> => {
    const { sheet, seq } = state
    if (sheet.kind !== "deleting") return
    const end = endOf(await ports.deleteNotes(sheet.ids))
    dispatch({ type: "answered", seq, end })
    await letGo(seq, sheet.of, end)
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
      dispatch({ type: "asked", of, ids })
    },
    confirm(): void {
      const before = state
      dispatch({ type: "confirmed" })
      if (state !== before) void run()
    },
    close(): void {
      dispatch({ type: "closed" })
    },
  }
}
