/**
 * My data's let-go of a week of the call (ST38, #2661): the runtime that owns
 * the request, over `./call-deleting`'s pure sheet. The page reads the
 * snapshot and says what was pressed.
 *
 * - **The request runs only after a confirm.** `run` starts only when the
 *   step accepted `confirmed` (from the asking sheet, or Try again after no
 *   answer), and calls `ports.deleteCallStep` once (LA19).
 * - **On the video's receipt** the phone's own copy of the video, if it
 *   fetched one for Studio's Calls, goes too (`forgetCopy`).
 * - **What went leaves the page:** once home answered, the list is read
 *   again (`reread`).
 */
import type { CallStep, CallStepAsked } from "@/lib/home-link/delete-note"

import type { CallAsk, CallSheet, CallSheetEvent } from "./call-deleting"
import { CLOSED, readCallStep, stepCallSheet } from "./call-deleting"

export type CallDeletingPorts = {
  /** Asks home to let a week's step go, one run; never rejects. */
  readonly deleteCallStep: (
    from: string,
    step: CallStep
  ) => Promise<CallStepAsked>
  /** Removes the phone's own copy of a week's video; never rejects. */
  readonly forgetCopy: (from: string) => Promise<void>
  /** Reads the weeks again, so what went leaves the page. */
  readonly reread: () => void
}

export type CallDeleting = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => CallSheet
  /** "Delete the video…" or "Delete the rest…": opens the sheet. */
  readonly ask: (ask: CallAsk) => void
  /** "Delete for good", or Try again. */
  readonly confirm: () => void
  /** "Keep it", Done, or the sheet dismissed. */
  readonly close: () => void
}

export function createCallDeleting(ports: CallDeletingPorts): CallDeleting {
  let sheet: CallSheet = CLOSED
  const listeners = new Set<() => void>()

  const dispatch = (event: CallSheetEvent): void => {
    const next = stepCallSheet(sheet, event)
    if (next === sheet) return
    sheet = next
    for (const listener of listeners) listener()
  }

  const run = async (): Promise<void> => {
    if (sheet.kind !== "deleting") return
    const { ask } = sheet
    const end = readCallStep(await ports.deleteCallStep(ask.from, ask.step))
    dispatch({ type: "answered", end })
    if (end.kind === "gone" && ask.step === "video") {
      await ports.forgetCopy(ask.from)
    }
    if (end.kind !== "unanswered") ports.reread()
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => sheet,
    ask(ask): void {
      dispatch({ type: "asked", ask })
    },
    confirm(): void {
      const before = sheet
      dispatch({ type: "confirmed" })
      if (sheet !== before && sheet.kind === "deleting") void run()
    },
    close(): void {
      dispatch({ type: "closed" })
    },
  }
}
