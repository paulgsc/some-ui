/**
 * The two-phase custody handoff (install successor before releasing
 * predecessor), proven live in Chromium: the hold is never released before
 * the committed replacement is confirmed installed.
 *
 * `scope-registry.test.ts` proves the call ordering with spies. This proves
 * the claim as canon Theorem D.3 states it — `Safe_T` never lapses: the
 * harness page is bright white, and `resolveCommitted`'s realization delays
 * before installing its dark successor, so a premature release would show a
 * native-bright frame to the frame oracle.
 *
 * Registration (which installs the hold) runs *before* `captureFrames()`:
 * its setup-skip estimate may under-skip by up to 20ms (see `frames.ts`),
 * which could otherwise catch the page's genuine pre-hold white frame.
 *
 * Classification (#1360): already compliant (frame oracle).
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

  // Registration runs before captureFrames() (see the header), so the page
  // is already dark when it starts looking.
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
          // Widens the window in which a release-before-confirm ordering
          // would leak, so a correct-by-accident ordering cannot pass.
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
