/**
 * #1262 Gate 0, G0.5 — the issue's own suggested remedy (recursive
 * shadow-aware scan + one `MutationObserver` per discovered root + one
 * `<style>`/inline theme per discovered root), implemented *only* here, for
 * the falsification harness — never in production `pipeline.ts`. Its job is
 * narrow: prove or falsify one proposition (per
 * docs/gate0/1262-falsification-report.md's G0.5) — that reachability
 * (finding every shadow root, eventually) is not the same thing as admission
 * control (never letting a native-bright frame paint).
 *
 * This is deliberately a *simulation* of the issue's proposal, not a
 * faithful reduction of `pipeline.ts` — it doesn't wire through
 * transport's estimator/hypothesis machinery, doesn't distinguish
 * `SurfaceKey`s, and themes by a single hardcoded rule (any element whose
 * computed background is literal white). None of that matters to the
 * proposition under test, which is purely about *timing*: does a debounced,
 * reactive, however-complete-eventually scan admit a native-bright frame
 * before it catches up. `RECONCILE_POLICY.debounceMs` (pipeline.ts:60) is
 * reproduced exactly (`DEBOUNCE_MS = 50` below) since the timing claim is
 * meaningless against a different number.
 */

import type { Page } from "@playwright/test"

/**
 * Installs the naive remedy into `page`'s current document. Idempotent
 * within one page load is not guaranteed — call once per page.
 */
export async function installNaiveRemedy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const DEBOUNCE_MS = 50 // RECONCILE_POLICY.debounceMs, pipeline.ts:60
    const THEMED_ATTR = "data-naive-patched"
    const DARK_BG = "rgb(23, 23, 23)"

    let pendingRound: ReturnType<typeof setTimeout> | null = null
    const observedRoots = new WeakSet<Node>()

    function isUnthemedWhiteSurface(el: Element): boolean {
      if (el.hasAttribute(THEMED_ATTR)) return false
      return getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)"
    }

    // The issue's own proposed fix, verbatim: a TreeWalker extended to
    // recurse into `element.shadowRoot` wherever it finds one, walking each
    // shadow tree exactly as it walks the light tree — no different from
    // pipeline.ts's real scan() (which does *not* do this; that omission is
    // G0.1) except for this one added branch.
    function recursiveScanAndTheme(root: Node): void {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode()
      while (node !== null) {
        if (node instanceof HTMLElement) {
          if (isUnthemedWhiteSurface(node)) {
            // "a separate stylesheet injected *into each discovered shadow
            // root*" (the issue's own proposed resolution) reduced to its
            // observable effect for this harness: the surface visibly
            // stops being native-bright. Per-root <style> injection vs.
            // direct inline recolor makes no difference to the timing
            // proposition under test.
            node.style.setProperty("background-color", DARK_BG, "important")
            node.setAttribute(THEMED_ATTR, "")
          }
          const shadow = node.shadowRoot
          if (shadow !== null) {
            observeRoot(shadow)
            recursiveScanAndTheme(shadow)
          }
        }
        node = walker.nextNode()
      }
    }

    function scheduleRound(): void {
      if (pendingRound !== null) clearTimeout(pendingRound)
      pendingRound = setTimeout(() => {
        pendingRound = null
        recursiveScanAndTheme(document.documentElement)
      }, DEBOUNCE_MS)
    }

    // "One observer... per root" — a fresh MutationObserver on every newly
    // discovered shadow root, exactly mirroring pipeline.ts's single
    // document-level observer's shape (childList/subtree/attributes on
    // style+class) but re-attached per root instead of once at the document.
    function observeRoot(root: Node): void {
      if (observedRoots.has(root)) return
      observedRoots.add(root)
      const observer = new MutationObserver(() => scheduleRound())
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      })
    }

    // Initial census, same shape as pipeline.ts's observe() + rescan().
    observeRoot(document.documentElement)
    recursiveScanAndTheme(document.documentElement)
    new MutationObserver(() => scheduleRound()).observe(
      document.documentElement,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      }
    )
  })
}

/**
 * G0.3's "sustained mutation burst": repeatedly creates a fresh, populated,
 * connected open shadow root (trace 1's shape) every `intervalMs` for
 * `durationMs`. Each new root's `MutationObserver`/coalescer registration
 * (installed reactively by the naive remedy's own recursive scan, itself
 * only triggered on the *next* debounced round) is perpetually racing the
 * next burst tick — under sustained churn each new mutation re-arms the
 * 50ms debounce before the previous one fires, so the exposed native-bright
 * window has no fixed upper bound for as long as the burst continues.
 */
export async function sustainedShadowChurn(
  page: Page,
  durationMs: number,
  intervalMs = 10
): Promise<void> {
  await page.evaluate(
    ({ durationMs, intervalMs }) => {
      return new Promise<void>((resolve) => {
        const anchor = document.getElementById("host-anchor")
        if (anchor === null) throw new Error("fixture missing #host-anchor")
        const start = performance.now()
        let count = 0

        // An arrow function assigned to a const, not a function declaration
        // — TypeScript does not carry the `anchor !== null` narrowing above
        // into a hoisted function declaration's body (it can't prove the
        // check ran before any call), but does carry it into a same-scope
        // const closure declared textually after the check.
        const tick = (): void => {
          const host = document.createElement("div")
          host.className = "shadow-churn-host"
          const root = host.attachShadow({ mode: "open" })
          const surface = document.createElement("div")
          surface.className = "shadow-churn-surface"
          // No text content: an unstyled text node here would inherit
          // `color-scheme`'s UA default text color (which, unlike
          // `background-color`, *does* cross the shadow boundary via
          // ordinary CSS inheritance from the host) and register as its own
          // spurious "still bright" reading once the surface's background is
          // dark-themed but the text stays light-on-dark by default — a
          // harness artifact this fixture must not produce, not a finding
          // about the extension.
          surface.setAttribute(
            "style",
            "position:fixed;inset:0;z-index:999999;margin:0;padding:0;background-color:rgb(255,255,255);"
          )
          root.appendChild(surface)
          anchor.appendChild(host)
          count += 1

          if (performance.now() - start < durationMs) {
            setTimeout(tick, intervalMs)
          } else {
            resolve()
          }
        }
        tick()
      })
    },
    { durationMs, intervalMs }
  )
}
