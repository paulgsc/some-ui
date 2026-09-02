/**
 * #1262 Gate 0, G0.4 — does a document_start content script's isolated-world
 * replacement of Element.prototype.attachShadow intercept page/main-world
 * calls to it, in Chromium? And declarative Shadow DOM: since it requires no
 * page call to attachShadow() at all, no such hook (main-world or
 * isolated-world) could cover it even if interception otherwise worked.
 *
 * docs/gate0/1262-falsification-report.md's G0.4 states the expected result
 * ("not a reliable cross-world interception boundary") but requires proving
 * it experimentally rather than assuming it — this spec is that proof, via
 * a throwaway probe extension (tests/e2e/fixtures/probe-extension/) that
 * patches Element.prototype.attachShadow in its own isolated world and
 * leaves a DOM marker if it ever observes a call. some-filter's real
 * extension (dist/) is not involved — this is a platform question, not a
 * some-filter-specific one, and the probe is a standalone extension so
 * dist/ need not even be loaded here.
 */

import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { chromium, expect, test } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROBE_DIR = path.resolve(__dirname, "..", "fixtures", "probe-extension")
const FIXTURE_PATH = path.resolve(
  __dirname,
  "..",
  "fixtures",
  "probe-attachshadow-page.html"
)

test.describe("G0.4 — cross-world attachShadow interception boundary (Chromium)", () => {
  test("an isolated-world document_start patch of Element.prototype.attachShadow does not observe a main-world page call; declarative Shadow DOM bypasses it entirely, by construction", async () => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[FILTER][gate0] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set."
      )
    }
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sw-gate0-probe-")
    )

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${PROBE_DIR}`,
        `--load-extension=${PROBE_DIR}`,
        "--allow-file-access-from-files",
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
      ],
    })

    try {
      const page = await context.newPage()
      await page.goto(`file://${FIXTURE_PATH}`)
      await page.waitForTimeout(200)

      const result = await page.evaluate(() => {
        const declarativeHost = document.getElementById("declarative-host")
        return {
          isolatedWorldObservedTheCall: document.documentElement.hasAttribute(
            "data-probe-isolated-world-intercepted"
          ),
          imperativeHostHasShadowRoot:
            document.getElementById("imperative-host")?.shadowRoot !== null,
          declarativeShadowRootExists: declarativeHost?.shadowRoot !== null,
          declarativeSurfaceReachable:
            declarativeHost?.shadowRoot?.getElementById(
              "declarative-surface"
            ) !== null &&
            declarativeHost?.shadowRoot?.getElementById(
              "declarative-surface"
            ) !== undefined,
        }
      })

      // The imperative call happened (sanity check) but the isolated-world
      // patch never saw it — Chromium's isolated worlds have genuinely
      // separate built-in prototypes, not merely separate global variables.
      // A document_start content-script hook on Element.prototype is
      // therefore *not* a reliable creation-interception boundary for
      // shadow roots a vendor page creates itself.
      expect(result.imperativeHostHasShadowRoot).toBe(true)
      expect(
        result.isolatedWorldObservedTheCall,
        "isolated-world Element.prototype.attachShadow patch should NOT observe a main-world page call — if this is ever true, Chromium's world isolation model has changed and G0.4's conclusion needs revisiting"
      ).toBe(false)

      // Declarative Shadow DOM: the root exists with no attachShadow() call
      // from any world at all — confirming an imperative hook, even a
      // hypothetically working cross-world one, structurally cannot be a
      // complete creation-interception strategy on its own.
      expect(result.declarativeShadowRootExists).toBe(true)
      expect(result.declarativeSurfaceReachable).toBe(true)
    } finally {
      await context.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
