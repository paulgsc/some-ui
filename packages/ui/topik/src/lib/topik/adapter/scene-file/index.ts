/**
 * A scene the learner picked from storage (docs/makjang/README.md, "Pulling
 * a scene back"): the file the platform's picker handed over, read as text.
 * On Android the WebView answers `<input type="file">` with the system
 * picker, where the learner's drive is a document provider, so there is no
 * plugin and no permission here. What the text holds is the tree intake's to
 * judge, exactly as a paste.
 *
 * The read waits on a document provider, which answers when it likes, so it
 * runs inside `callForeign` (F1), and the caller gets its outcome by
 * callback: no component awaits it.
 */

import type { ForeignOutcome, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

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

const PORT = { name: "picked file", classify, report: reportFailure }

export function readSceneFile(
  file: Blob,
  onRead: (outcome: ForeignOutcome<string>) => void
): void {
  void callForeign({
    port: PORT,
    deadlineMs: READ_DEADLINE_MS,
    start: () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (): void => resolve(String(reader.result))
        reader.onerror = (): void =>
          reject(reader.error ?? new Error("read failed"))
        reader.readAsText(file)
      }),
  }).outcome.then(onRead)
}
