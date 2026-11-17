/**
 * The phone's own log for this app, tag "SomeUI" (`NativeLogPlugin.java`
 * says why it exists): every failure `reportFailure` reports, and the notes
 * the app writes on purpose. Device build only; installed before the device
 * storage opens (`device-backend/boot`).
 */
import { registerPlugin } from "@capacitor/core"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { addFailureSink, FOREIGN_FAILURE_TAG } from "@some-ui/intent-kit"

type Level = "info" | "error"

const NativeLog = registerPlugin<{
  write: (options: { line: string; level: Level }) => Promise<void>
}>("NativeLog")

/** How many causes deep a line goes; a cycle or a long chain stops there. */
const CAUSE_DEPTH = 4

/**
 * A failure's cause as one line: each error's type and message, the cause
 * it wraps after ` <- `, never an object dump. The innermost is often the
 * platform's own words, such as Android's "failed to connect to /<home>
 * from /<this phone>", which say which network the phone was on.
 *
 * NL1 (#3097): a reported failure's line carries every message in its
 * cause chain, to `CAUSE_DEPTH`, whichever reporter reports it (a port, or
 * the home link's one report of a stretch away). Held by `./index.test.ts`.
 */
function describeCause(cause: unknown): string {
  const parts: Array<string> = []
  let at: unknown = cause
  for (let depth = 0; depth < CAUSE_DEPTH; depth += 1) {
    if (!(at instanceof Error)) {
      if (depth === 0 || (at !== undefined && at !== null)) {
        parts.push(String(at))
      }
      break
    }
    parts.push(`${at.name}: ${at.message}`)
    at = at.cause
  }
  return parts.join(" <- ")
}

/** The line a reported failure becomes; what the launch test greps for. */
export function failureLine(failure: ForeignFailure): string {
  const { kind, summary, cause } = failure.error
  return `${FOREIGN_FAILURE_TAG} [${failure.port}] ${kind}: ${summary} (${describeCause(cause)})`
}

/** Writes one line; best effort, since a log that fails has nowhere to say so. */
export function writeNativeLog(line: string, level: Level = "info"): void {
  // Unbounded (F1, scripts/foreign-boundary.allowlist): nobody waits on it.
  // Ignored: a log that fails has nowhere to say so.
  void NativeLog.write({ line, level }).catch(() => undefined)
}

let installed = false

/** Sends every reported failure to the native log as well. Once per page. */
export function installNativeLog(): void {
  if (installed) return
  installed = true
  addFailureSink((failure) => writeNativeLog(failureLine(failure), "error"))
}
