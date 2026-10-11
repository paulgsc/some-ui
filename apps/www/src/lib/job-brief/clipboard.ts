import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import { foreignValue } from "@/lib/intent/foreign"

/** A write the WebView answers at once, or not at all. */
const COPY_DEADLINE_MS = 5_000

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Copying didn’t finish. Try again.",
    }
  }
  // No clipboard API (`TypeError`), or the WebView refuses this page one:
  // no retry changes either.
  return error instanceof TypeError ||
    (error instanceof DOMException && error.name === "NotAllowedError")
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "Copying isn’t available here. Select the text instead.",
      }
    : { kind: "unknown", retryable: true, summary: "Couldn’t copy. Try again." }
}

const PORT: ForeignPort = { name: "clipboard", classify, report: reportFailure }

/** Puts `text` on the clipboard; throws as the port classified a failure. */
export function copyText(text: string): Promise<void> {
  return foreignValue(
    callForeign({
      port: PORT,
      deadlineMs: COPY_DEADLINE_MS,
      start: () => navigator.clipboard.writeText(text),
    })
  )
}
