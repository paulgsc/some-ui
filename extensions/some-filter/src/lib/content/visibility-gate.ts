/**
 * Deferring the expensive work in a tab nobody is looking at.
 *
 * ## The cost this exists to bound
 *
 * `content.ts`'s `runAutoTheme()` is the most expensive thing this extension
 * does: a whole-document `TreeWalker` with a `getComputedStyle` per element,
 * two full-document style recalcs for `withVendorColorsVisible`, a second
 * whole-document walk for the legibility channel, and then three 250ms
 * `setInterval` polls that run for the lifetime of the tab. All of it ran at
 * `document_end` in *every* tab, and nothing anywhere in this extension
 * consulted `visibilityState`.
 *
 * Per tab that is affordable. Per *tab set* it is not, and the difference is
 * not linear in the way it first looks: Firefox shares a small pool of
 * content processes across all tabs (eight by default), so a profile with
 * 200+ tabs puts tens of documents on each process's single main thread. An
 * extension reload or a window restore reaches `document_end` in all of them
 * at once, and they serialise there. Reported as an immediate, whole-browser
 * hang — which is precisely the shape that produces one.
 *
 * ## Why deferral is free rather than a trade
 *
 * A hidden tab paints no frame, so nothing about being late is observable —
 * and the prepaint veil has been up since `document_start`, so a deferred
 * tab is a *dark* tab, not an unthemed one. The direction that costs
 * something is unreachable here, so waiting costs nothing at all.
 *
 * ## Deferral only, deliberately — not suspend-on-hide
 *
 * The symmetric half (stop the watchers when a tab goes *back* to the
 * background, restart them on return) is the larger win, since it covers
 * every tab the user has visited once rather than only the ones never
 * visited. It is deliberately not here.
 *
 * Resuming re-enters `runAutoTheme()`, which builds a *fresh* hypothesis —
 * `createContentSession` is unguarded. A fresh scan of an
 * already-themed page sees only what `shouldSkip` does not exclude, and
 * `shouldSkip` excludes everything carrying `data-sw-patched`, i.e. every
 * surface this extension already darkened. So the new hypothesis contains
 * exactly the complement of our own work, `pageAlreadyDark()` reads that as
 * a dark page, and `decide()` emits `restore-native` — stripping the theme
 * and leaving a white page on tab switch.
 *
 * That is not a bug in suspend/resume; it is the classifier reading its own
 * output back, which needs a real answer (persisting the hypothesis across a
 * pause, or not rebuilding the session at all) rather than a workaround
 * bolted onto this gate. Deferral has no such hazard because nothing has
 * been themed yet when it fires.
 *
 * ## Injected rather than reading `document`
 *
 * The harness cannot exercise this: headless Chromium reports every page as
 * `visible` regardless of which target holds the foreground, so an e2e test
 * of a hidden tab would assert against a page that is not hidden. Taking the
 * visibility source as a parameter is what makes the gate testable at all,
 * and the fake in the unit suite drives the exact transition — hidden at
 * `document_end`, visible later — that the real bug depends on.
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
   * True while a deferral is armed — the tab has not been shown yet, so
   * nothing this gate guards has started.
   *
   * Callers that do startup-shaped work of their own must consult this, or
   * the deferral buys nothing. `content.ts`'s `yt-navigate-finish` handler
   * is the case that forced it into the type: it calls
   * `shadowScopeDiscovery.discover(document)` unconditionally in auto mode,
   * which is a whole-document `TreeWalker` that projects every shadow root
   * it finds and installs a per-root observer. A background-loaded SPA tab
   * fires that event without ever being shown, so the walk this gate exists
   * to defer ran anyway, and the tab held the observers afterwards.
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
      // Any pending deferral belongs to a superseded caller. Left armed, a
      // tab toggled auto -> off -> auto while hidden would start two
      // sessions the moment it is finally shown.
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
