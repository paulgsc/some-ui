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

/** A failure's cause as one line: its type and message, never an object dump. */
function describeCause(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  return String(cause)
}

/** The line a reported failure becomes; what the launch test greps for. */
export function failureLine(failure: ForeignFailure): string {
  const { kind, summary, cause } = failure.error
  return `${FOREIGN_FAILURE_TAG} [${failure.port}] ${kind}: ${summary} (${describeCause(cause)})`
}

/** Writes one line; best effort, since a log that fails has nowhere to say so. */
export function writeNativeLog(line: string, level: Level = "info"): void {
  // Unbounded (F1, scripts/foreign-boundary.allowlist): nobody waits on it.
  void NativeLog.write({ line, level }).catch(() => undefined)
}

let installed = false

/** Sends every reported failure to the native log as well. Once per page. */
export function installNativeLog(): void {
  if (installed) return
  installed = true
  addFailureSink((failure) => writeNativeLog(failureLine(failure), "error"))
}
