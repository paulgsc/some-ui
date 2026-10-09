/**
 * A scene the learner picked from storage (docs/makjang/README.md, "Pulling
 * a scene back"): the file the platform's picker handed over, read as text.
 * On Android the WebView answers `<input type="file">` with the system
 * picker, where the learner's drive is a document provider, so there is no
 * plugin and no permission here. What the text holds is the tree intake's to
 * judge, exactly as a paste.
 *
 * The read waits on a document provider, which answers when it likes, so it
 * runs inside `callForeign` (F1). The runtime holds the one read in flight:
 * a newer pick, or `cancel` when the learner leaves, lets it go, so a late
 * result never lands over what the screen shows now. The lesson CRM reads
 * its uploads with the same `file.text()`, awaited on a desktop page.
 */

import type {
  ForeignCall,
  ForeignPort,
  ForeignVerdict,
} from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

/** Far above any scene tree, far below a photo or a video. */
export const SCENE_FILE_MAX_BYTES = 1_000_000

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

export type SceneFileState =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "failed"; summary: string }

export class SceneFileRuntime {
  private state: SceneFileState = { kind: "idle" }
  private readonly listeners = new Set<() => void>()
  private call: ForeignCall<string> | null = null

  getSnapshot = (): SceneFileState => this.state

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
    if (file.size > SCENE_FILE_MAX_BYTES) {
      this.set({
        kind: "failed",
        summary: "That file is too large to be a scene.",
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

  /** The learner left: a read in flight changes nothing. */
  cancel = (): void => {
    this.call?.abandon()
    this.call = null
    this.state = { kind: "idle" }
  }

  private set(state: SceneFileState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
