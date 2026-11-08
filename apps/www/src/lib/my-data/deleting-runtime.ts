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
 *   too, inside the delete's run, before a drain run could send it again.
 *   Nothing home did not answer with a receipt is let go.
 * - **Then My data reads again** (`reread`) while a page of it shows, so
 *   the list no longer shows what went.
 * - **A delete whose answer was lost settles on home's list.** Each note is
 *   owed (`ports.owed`) before the run sends, and leaves only on home's
 *   word for it; `resume` reads what home deleted (`askReceipts`, no
 *   `DELETE`) and lets go of each owed note home names there.
 *
 * LA19 (docs/learner-data-authority.md): `ports.deleteNotes` runs only in
 * `run`, after `stepDeleting` accepted a `confirmed` from the sheet;
 * `resume` sends no delete.
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import type { DeleteAsked } from "@/lib/home-link/delete-note"
import type { OwedDelete } from "@/lib/home-link/deleting-notes"

import type {
  DeletableKind,
  DeleteEnd,
  DeletingEvent,
  DeletingState,
  ReceiptsReading,
} from "./deleting"
import {
  answeredIds,
  endOf,
  INITIAL_DELETING,
  isDeletableKind,
  stepDeleting,
} from "./deleting"
import { isKind } from "./model"

export type DeletingPorts = {
  /**
   * Asks home to delete each note for good, one run, handing what came of it
   * to `settle` inside that run; never rejects.
   */
  readonly deleteNotes: (
    ids: ReadonlyArray<string>,
    settle: (asked: DeleteAsked) => Promise<void>
  ) => Promise<void>
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
  /** The notes asked to be deleted and not yet answered for (`lib/home-link/deleting-notes`). */
  readonly owed: {
    readonly list: () => ReadonlyArray<OwedDelete>
    /** False when the phone could not keep them: then nothing is sent. */
    readonly owe: (of: DeletableKind, ids: ReadonlyArray<string>) => boolean
    readonly answered: (ids: ReadonlyArray<string>) => void
  }
  /** Home's list of what it deleted for good; never rejects. */
  readonly askReceipts: () => Promise<ReceiptsReading>
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
  /** As My data opens: settles each owed note home's list says it deleted. */
  readonly resume: () => void
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

  /** A let-go that threw (its port's own failure): said, and its notes stay owed. */
  const threw = (error: unknown): null => {
    reportFailure({
      port: "my data: this phone's copy of what home deleted",
      error: toIntentError(error),
    })
    return null
  }

  /**
   * Lets go of what home deleted; false only when the let-go threw, so its
   * notes stay owed.
   */
  const letGo = async (
    seq: number,
    of: DeletableKind,
    end: DeleteEnd
  ): Promise<boolean> => {
    if (end.kind !== "answered" || end.gone.length === 0) return true
    const ids = end.gone.map((receipt) => receipt.id)
    const done = await ports.letGo(of, ids).catch(threw)
    dispatch({ type: "letGoEnded", seq, let: done === true })
    return done !== null
  }

  const run = async (): Promise<void> => {
    const { sheet, seq } = state
    if (sheet.kind !== "deleting") return
    if (!ports.owed.owe(sheet.of, sheet.ids)) {
      dispatch({ type: "answered", seq, end: endOf({ kind: "busy" }) })
      return
    }
    // Set inside `settle`, which TypeScript can't see change a `let`.
    const went = { any: false }
    await ports.deleteNotes(sheet.ids, async (asked) => {
      const end = endOf(asked)
      dispatch({ type: "answered", seq, end })
      went.any = end.kind === "answered" && end.gone.length > 0
      if (await letGo(seq, sheet.of, end)) {
        ports.owed.answered(answeredIds(asked))
      }
    })
    // Once the delete's run has freed the link, which this read takes.
    if (went.any) ports.reread()
  }

  let resuming = false
  const resume = async (): Promise<void> => {
    const owed = ports.owed.list()
    if (owed.length === 0 || resuming || state.sheet.kind === "deleting") {
      return
    }
    resuming = true
    try {
      const read = await ports.askReceipts()
      if (read.kind !== "read") return
      const deleted = new Set(read.receipts.map((receipt) => receipt.id))
      let went = false
      for (const of of new Set(owed.map((entry) => entry.of))) {
        if (!isKind(of) || !isDeletableKind(of)) continue
        const ids = owed
          .filter((entry) => entry.of === of && deleted.has(entry.id))
          .map((entry) => entry.id)
        if (ids.length === 0) continue
        went = true
        if ((await ports.letGo(of, ids).catch(threw)) !== null) {
          ports.owed.answered(ids)
        }
      }
      if (went) ports.reread()
    } finally {
      resuming = false
    }
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
    resume(): void {
      void resume()
    },
  }
}
