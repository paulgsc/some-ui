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
 * The same asymmetry `provisional.ts` rests on, one scale up. A hidden tab
 * paints no frame, so nothing about being late is observable — and the
 * prepaint veil has been up since `document_start`, so a deferred tab is a
 * *dark* tab, not an unthemed one. The direction that costs something is
 * unreachable here, so waiting costs nothing at all.
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
    whenVisible(start: () => void): void {
      // Any pending deferral belongs to a supserseded caller. Left armed, a
      // tab toggled auto -> off -> auto while hidden would start two
      // sessions the moment it is finally shown.
      cancel()

      if (source.visibilityState !== "hidden") {
        start()
        return
      }

      const onVisible = (): void => {
        // `visibilitychange` also fires on the visible -> hidden edge.
        if (source.visibilityState === "hidden") return
        cancel()
        start()
      }
      waiter = onVisible
      source.addEventListener("visibilitychange", onVisible)
    },
  }
}
