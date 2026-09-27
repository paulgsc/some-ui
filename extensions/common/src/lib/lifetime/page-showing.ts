import type { Disposables } from "./disposables"

/**
 * Whether the page is showing: its tab is the visible one and nothing on it
 * has gone fullscreen (Charter §7 — fullscreen is a hard suspend, and an
 * overlay would sit outside the fullscreen element anyway).
 *
 * Deliberately *not* window focus. An overlay captured into a stream (an OBS
 * window capture) is visible while the user's focus is elsewhere, and that is
 * exactly when it must keep running. some-conveyor's PageMonitor, which this
 * is the shared core of (#281), adds focus and activity signals for its own
 * product; those stay in the workspace.
 */
export function isPageShowing(doc: Document = document): boolean {
  // `!fullscreenElement`, not `=== null`: an environment without the
  // Fullscreen API leaves it undefined, which means nothing is fullscreen.
  return doc.visibilityState === "visible" && !doc.fullscreenElement
}

/**
 * Call `onChange` whenever {@link isPageShowing} flips, until `life` ends.
 */
export function watchPageShowing(
  life: Disposables,
  onChange: (showing: boolean) => void,
  doc: Document = document
): void {
  let showing = isPageShowing(doc)
  const check = (): void => {
    const next = isPageShowing(doc)
    if (next === showing) return
    showing = next
    onChange(next)
  }
  doc.addEventListener("visibilitychange", check, { signal: life.signal })
  doc.addEventListener("fullscreenchange", check, { signal: life.signal })
}
