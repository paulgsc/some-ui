/**
 * #1262 Gate 0, G0.6 — the candidate custody primitive under test: a
 * theme-independent, synchronously-installed, full-viewport occlusion
 * layer. Implemented only here, for the falsification harness — never in
 * production `pipeline.ts`, same discipline as `naive-remedy.ts`.
 *
 * Per docs/gate0/1262-falsification-report.md's G0.6: "Choose the coarsest
 * theme-independent hold available for a rendering scope and prove it
 * prevents the forbidden pixel class regardless of the vendor colors inside
 * the scope... If no non-destructive primitive satisfies this for an
 * arbitrary theme, the universal fallback is concealment/occlusion. That
 * cost is honest."
 *
 * G0.4 already establishes, experimentally, that a document_start
 * isolated-world content script cannot synchronously intercept a main-world
 * page's own `attachShadow()` calls, and that declarative Shadow DOM has no
 * call to intercept at all — so a *per-scope*, creation-time hold is not a
 * mechanism this platform actually offers. The only theme-independent hold
 * that is both installable before initial release and immune to the
 * discovery gap G0.1/G0.2 demonstrate is a coarser-than-scope one: keep a
 * document-granularity occlusion engaged for as long as the page might
 * contain an undiscovered rendering scope, exactly the existing document
 * veil's own custody shape (`public/prepaint-start.js`/`prepaint.css`),
 * simply held open-ended instead of released once initial classification
 * completes. This module is the null-adapter form of that idea — it knows
 * nothing about swatches, colors, or which surfaces need theming; its only
 * job is custody.
 */

import type { Page } from "@playwright/test"

/** Installs a permanently-engaged, theme-independent occlusion layer. Never released for the lifetime of the page — the deliberately blunt end of G0.6's spectrum, not a production design. */
export async function installPermanentOcclusion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const veil = document.createElement("div")
    veil.id = "__gate0_occlusion_primitive"
    veil.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;margin:0;padding:0;" +
        "background-color:rgb(10,10,10);pointer-events:none;"
    )
    document.documentElement.appendChild(veil)

    // Self-healing, mirroring prepaint-start.js's own re-insertion observer:
    // a hold that a hostile/careless page could remove is not a hold. This
    // is the one piece of "theme-independent" behavior this primitive
    // needs — everything else about it is a static, unconditional cover.
    const observer = new MutationObserver(() => {
      if (document.getElementById("__gate0_occlusion_primitive") === null) {
        document.documentElement.appendChild(veil)
      }
    })
    observer.observe(document.documentElement, { childList: true })
  })
}
