/**
 * SF-RG (#1265), acceptance criterion: "The two-phase custody handoff
 * (install successor before releasing predecessor — #1264's new
 * theorem/corollary) is proven for at least one scope, live in a browser
 * (Playwright, Chromium): install the hold, install a committed
 * replacement, confirm the hold is never released before the replacement is
 * confirmed installed."
 *
 * `scope-registry.test.ts` already proves the call ordering with mocked
 * `install`/`release` spies — a unit-level proof of the *code path*. This
 * spec proves the same claim empirically, the way canon Theorem D.3 states
 * it: that `Safe_T` never lapses. The harness page's background is bright
 * white (`fixtures/scope-registry-harness-page.html`) standing in for
 * unheld vendor content; `resolveCommitted`'s realization deliberately
 * delays before installing its own dark successor, so if the implementation
 * ever released the hold before that successor was confirmed installed, the
 * frame oracle below would catch a native-bright frame during the gap — not
 * merely "the code reads left to right in the right order."
 *
 * Registration (which installs the hold) runs *before* `captureFrames()` is
 * called, not inside its measured callback: `captureFrames` seeks into the
 * recording using a wall-clock estimate of "just before `fn()`'s first side
 * effect" (`frames.ts`'s own header comment explains why, and that the
 * estimate is deliberately allowed to under-skip by up to 20ms rather than
 * risk skipping past it). If registration itself ran inside the measured
 * window, that slop could catch the harness page's genuine pre-hold white
 * frame and misreport it as a handoff leak — a flake in the test, not a bug
 * in the module under test. Registering first means the page is already
 * dark by the time `captureFrames` starts looking, so its callback measures
 * exactly the handoff this spec is about.
 */

import "@filter/playwright/fixtures/scope-registry-window-types"

import { captureFrames, firstLeak } from "@filter/playwright/fixtures/frames"
import { DARK } from "@filter/playwright/fixtures/pixels"
import {
  expect,
  test,
} from "@filter/playwright/fixtures/scope-registry-harness"

test("installs and confirms the committed successor before releasing the hold — no native-bright frame during the handoff", async ({
  context,
  harness,
}) => {
  const page = await harness.goto("scope-registry-harness-page")

  // Registration — which installs the hold — runs before captureFrames() is
  // called, per this file's own header comment: the page must already be
  // dark by the time captureFrames() starts looking, so its callback below
  // measures exactly the handoff and nothing about setup timing.
  await page.evaluate(() => {
    const { createScopeRegistry } = window.ScopeRegistryModule
    const { createOcclusionHold } = window.CustodyPrimitiveModule

    const registry = createScopeRegistry<string>()
    const hold = createOcclusionHold(document)
    registry.register("root", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold,
    })
    registry.startResolving("root")
    window.__sfHandoffRegistry = registry
  })

  let finalCheck:
    | {
        stateKind: string | undefined
        successorPresent: boolean
        veilPresent: boolean
      }
    | undefined

  const samples = await captureFrames(context, page, async () => {
    finalCheck = await page.evaluate(async () => {
      const registry = window.__sfHandoffRegistry
      if (registry === undefined) throw new Error("registry not initialized")

      await registry.resolveCommitted("root", {
        revision: "test-committed",
        install: async () => {
          // Widens the window during which a wrong (release-before-confirm)
          // ordering would leak the page's own bright background —
          // otherwise a correct-by-accident synchronous ordering could pass
          // this spec even with the bug present.
          await new Promise((resolve) => setTimeout(resolve, 150))
          const successor = document.createElement("div")
          successor.id = "__committed_successor"
          successor.setAttribute(
            "style",
            "position:fixed;inset:0;z-index:2147483647;margin:0;padding:0;" +
              "background-color:rgb(0,40,0);"
          )
          document.documentElement.appendChild(successor)
        },
        uninstall: () => {
          document.getElementById("__committed_successor")?.remove()
        },
      })

      return {
        stateKind: registry.stateOf("root")?.kind,
        successorPresent:
          document.getElementById("__committed_successor") !== null,
        veilPresent:
          document.querySelector("[data-scope-registry-hold]") !== null,
      }
    })
  })

  expect(finalCheck?.stateKind).toBe("COMMITTED")
  expect(finalCheck?.successorPresent).toBe(true)
  expect(finalCheck?.veilPresent).toBe(false)

  const leak = firstLeak(samples, DARK)
  expect(
    leak,
    `frame ${String(leak?.frameIndex)} (${String(leak?.atSeconds)}s) leaked ` +
      `native-bright during the handoff: ${JSON.stringify(leak)}`
  ).toBeUndefined()
})
