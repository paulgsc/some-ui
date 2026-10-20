/**
 * A file the person picked from storage, as the platform's picker handed it
 * over, read as text: a topik scene or word set, a LeetType session file.
 * On Android the WebView answers `<input type="file">` with the system
 * picker, where the person's drive is a document provider, so there is no
 * plugin and no permission here. What the text holds is for the caller's
 * intake to judge.
 *
 * The read waits on a document provider, which answers when it likes, so it
 * runs inside `callForeign` (F1). The runtime holds the one read in flight:
 * a newer pick, or `cancel` when the person leaves, lets it go, so a late
 * result never lands over what the screen shows now. The lesson CRM reads
 * its uploads with the same `file.text()`, awaited on a desktop page.
 */

import type { ForeignCall, ForeignPort, ForeignVerdict } from "./foreign"
import { callForeign, ForeignDeadlineError, reportFailure } from "./foreign"

/** Far above any scene tree, word set or session file, far below a photo or a video. */
export const PICKED_FILE_MAX_BYTES = 1_000_000

/** A drive file is fetched on read; a phone on a slow line takes a while. */
const READ_DEADLINE_MS = 60_000

const classify = (error: unknown): ForeignVerdict =>
  error instanceof ForeignDeadlineError
    ? {
        kind: "unreachable",
        retryable: true,
        summary: "The file took too long to open. Try again.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "Couldn't open that file. Try again.",
      }

const PORT: ForeignPort = {
  name: "picked file",
  classify,
  report: reportFailure,
}

export type PickedFileState =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "failed"; summary: string }

export class PickedFileRuntime {
  private state: PickedFileState = { kind: "idle" }
  private readonly listeners = new Set<() => void>()
  private call: ForeignCall<string> | null = null

  getSnapshot = (): PickedFileState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Reads `file`; `onText` gets its text if it is still the latest pick. */
  open = (
    file: Pick<Blob, "text" | "size">,
    onText: (text: string) => void
  ): void => {
    this.call?.abandon()
    this.call = null
    if (file.size > PICKED_FILE_MAX_BYTES) {
      this.set({
        kind: "failed",
        summary: "That file is too large to open.",
      })
      return
    }
    const call = callForeign({
      port: PORT,
      deadlineMs: READ_DEADLINE_MS,
      start: () => file.text(),
    })
    this.call = call
    this.set({ kind: "reading" })
    void call.outcome.then((outcome) => {
      if (this.call !== call) return
      this.call = null
      this.set(
        outcome.status === "failed"
          ? { kind: "failed", summary: outcome.error.summary }
          : { kind: "idle" }
      )
      if (outcome.status === "succeeded") onText(outcome.value)
    })
  }

  /** The person left: a read in flight changes nothing. */
  cancel = (): void => {
    this.call?.abandon()
    this.call = null
    this.state = { kind: "idle" }
  }

  private set(state: PickedFileState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
