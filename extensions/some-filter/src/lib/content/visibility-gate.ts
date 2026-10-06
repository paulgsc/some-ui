/**
 * Deferring the expensive work in a tab nobody is looking at.
 *
 * ## The cost this exists to bound
 *
 * `runAutoTheme()` is this extension's most expensive work: a whole-document
 * `TreeWalker` with a `getComputedStyle` per element, two full-document style
 * recalcs, a second walk for the legibility channel, then three 250ms polls
 * for the tab's lifetime. Per tab that is affordable; per tab set it is not.
 * Firefox shares a small pool of content processes (eight by default), so a
 * 200+ tab profile puts tens of documents on each main thread, and an
 * extension reload or window restore reaches `document_end` in all of them
 * at once — a whole-browser hang.
 *
 * ## Why deferral is free
 *
 * A hidden tab paints no frame, and the prepaint veil has been up since
 * `document_start`, so a deferred tab is a *dark* tab, not an unthemed one.
 *
 * ## Deferral only, deliberately — not suspend-on-hide
 *
 * Stopping the watchers on hide and restarting on return would be the larger
 * win, but resuming re-enters `runAutoTheme()` with a *fresh* hypothesis. A
 * fresh scan skips every `data-sw-patched` surface, i.e. our own work, so it
 * sees only the complement, `pageAlreadyDark()` reads that as dark, and
 * `decide()` emits `restore-native` — a white page on tab switch. That is the
 * classifier reading its own output back, which needs a real answer
 * (persisting the hypothesis, or not rebuilding the session). Deferral has no
 * such hazard: nothing is themed yet when it fires.
 *
 * ## Injected rather than reading `document`
 *
 * Headless Chromium reports every page `visible`, so e2e cannot exercise a
 * hidden tab. Taking the visibility source as a parameter lets the unit
 * suite drive the real transition (hidden at `document_end`, visible later).
 */

/** The half of `Document` this gate needs, so a test can supply its own. */
export type VisibilitySource = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>

export type VisibilityGate = {
  /** Runs `start` now if visible, else once the tab first becomes visible. */
  whenVisible(start: () => void): void
  /** Drops any pending deferral without running it. */
  cancel(): void
  /**
   * True while a deferral is armed — the tab has not been shown, so nothing
   * this gate guards has started. Callers doing startup-shaped work of their
   * own must consult it, or the deferral buys nothing (e.g. `content.ts`'s
   * `yt-navigate-finish`, which fires in background-loaded SPA tabs and would
   * otherwise run the whole-document shadow discovery).
   */
  readonly pending: boolean
}

export function createVisibilityGate(
  source: VisibilitySource = document
): VisibilityGate {
  let waiter: (() => void) | null = null

  const cancel = (): void => {
    if (waiter === null) return
    source.removeEventListener("visibilitychange", waiter)
    waiter = null
  }

  return {
    cancel,
    get pending(): boolean {
      return waiter !== null
    },
    whenVisible(start: () => void): void {
      // A pending deferral belongs to a superseded caller; left armed, a
      // hidden tab toggled auto -> off -> auto would start two sessions.
      cancel()

      if (source.visibilityState !== "hidden") {
        start()
        return
      }

      const onVisible = (): void => {
        // `visibilitychange` fires on both edges.
        if (source.visibilityState === "hidden") return
        cancel()
        start()
      }
      waiter = onVisible
      source.addEventListener("visibilitychange", onVisible)
    },
  }
}
