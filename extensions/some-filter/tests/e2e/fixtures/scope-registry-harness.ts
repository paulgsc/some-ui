/**
 * A bare (no extension) Chromium context for the scope registry's
 * live-browser claims — two-phase handoff, self-healing under removal —
 * against the compiled `scope-registry.ts` + `custody-primitive.ts`
 * (`inline-module.ts`).
 *
 * Not `../fixture.ts` or `gate0-fixture.ts`: the real extension's auto
 * pipeline would add an unrelated source of visual change. Reuses
 * `frames.ts`'s oracle and `gate0-fixture.ts`'s `pageCreatedAt`, so
 * `captureFrames`'s setup skip works identically.
 */

import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test"

import { pageCreatedAt } from "./gate0-fixture"
import { compileAdapterModuleForBrowser } from "./inline-module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname)

/** Fixed so every captured video/frame set is directly comparable across runs — mirrors gate0-fixture.ts's own GATE0_VIEWPORT. */
const HARNESS_VIEWPORT = { width: 800, height: 600 }

const SCOPE_REGISTRY_GLOBAL = "ScopeRegistryModule"
const CUSTODY_PRIMITIVE_GLOBAL = "CustodyPrimitiveModule"

type ScopeRegistryFixtures = {
  context: BrowserContext
  harness: {
    /** Opens fixtures/<name>.html fresh, video-recorded, with the compiled modules injected as window[SCOPE_REGISTRY_GLOBAL] / window[CUSTODY_PRIMITIVE_GLOBAL]. */
    goto(name: string): Promise<Page>
  }
  videoDir: string
}

let cachedScopeRegistryScript: string | undefined
let cachedCustodyPrimitiveScript: string | undefined

function scopeRegistryScript(): string {
  cachedScopeRegistryScript ??= compileAdapterModuleForBrowser(
    "scope-registry.ts",
    SCOPE_REGISTRY_GLOBAL
  )
  return cachedScopeRegistryScript
}

function custodyPrimitiveScript(): string {
  cachedCustodyPrimitiveScript ??= compileAdapterModuleForBrowser(
    "custody-primitive.ts",
    CUSTODY_PRIMITIVE_GLOBAL
  )
  return cachedCustodyPrimitiveScript
}

export const test = base.extend<ScopeRegistryFixtures>({
  // eslint-disable-next-line no-empty-pattern
  videoDir: async ({}, use) => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sw-scope-registry-video-")
    )
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  },

  context: async ({ videoDir }, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[FILTER][scope-registry] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
          "Enter the playwright nix shell (nix develop .#playwright) or run " +
          "via scripts/claude-e2e.sh in an environment exposing " +
          "$PLAYWRIGHT_BROWSERS_PATH/chromium.\n"
      )
    }

    // As fixture.ts: new headless mode records screencast without a display.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    const browser = await chromium.launch({
      executablePath,
      headless: false,
      args: needsVirtualDisplay ? ["--headless=new"] : [],
    })

    const context = await browser.newContext({
      viewport: HARNESS_VIEWPORT,
      recordVideo: { dir: videoDir, size: HARNESS_VIEWPORT },
    })

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context)
    await context.close()
    await browser.close()
  },

  harness: async ({ context }, use) => {
    const openedPages: Array<Page> = []

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({
      async goto(name: string) {
        const page = await context.newPage()
        pageCreatedAt.set(page, Date.now())
        openedPages.push(page)
        await page.goto(`file://${path.join(FIXTURE_DIR, `${name}.html`)}`)
        // Two classic scripts, not one string: custody-primitive.ts's only
        // cross-file reference is type-only, so order never matters, and
        // this mirrors the module boundary.
        await page.addScriptTag({ content: custodyPrimitiveScript() })
        await page.addScriptTag({ content: scopeRegistryScript() })
        return page
      },
    })

    await Promise.all(
      openedPages.map((p) =>
        p.close().catch(() => {
          // already closed by captureFrames() — fine, mirrors gate0-fixture.ts
        })
      )
    )
  },
})

export { expect } from "@playwright/test"
