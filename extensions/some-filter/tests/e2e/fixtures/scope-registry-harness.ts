/**
 * SF-RG (#1265) e2e harness: a bare (no extension) Playwright Chromium
 * context used to prove the scope registry's live-browser claims — the
 * two-phase custody handoff, self-healing under adversarial removal —
 * against the compiled `src/adapter/scope-registry.ts` +
 * `custody-primitive.ts` modules directly (`inline-module.ts`).
 *
 * Deliberately not `../fixture.ts` or `gate0-fixture.ts`: both load the real
 * built extension via `--load-extension`, which would run `some-filter`'s
 * own auto-theme pipeline against whatever test page these specs use —
 * confounding the pixel/frame assertions here with a second, unrelated
 * source of visual change. #1265's acceptance criteria is explicit that
 * this story has "no wiring into content.ts, pipeline.ts, or any real page
 * yet"; this harness keeps that isolation on the test side too. It does,
 * however, reuse `frames.ts`'s frame oracle and `gate0-fixture.ts`'s
 * `pageCreatedAt` bookkeeping (so `captureFrames`'s setup-skip logic works
 * identically here) — exactly the reusable infrastructure the Gate 0 report
 * flagged as worth landing alongside its first real consumer.
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
export const HARNESS_VIEWPORT = { width: 800, height: 600 }

export const SCOPE_REGISTRY_GLOBAL = "ScopeRegistryModule"
export const CUSTODY_PRIMITIVE_GLOBAL = "CustodyPrimitiveModule"

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

    // Same headless-detection rationale as fixture.ts/gate0-fixture.ts:
    // Chrome's new headless mode supports CDP screencast recording without
    // a display server.
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
        // Two separate classic scripts, not one concatenated string:
        // custody-primitive.ts's only cross-file reference is a type-only
        // import (erased), so injection order between the two never
        // matters — keeping them separate mirrors the real module boundary
        // between "the state machine" and "the DOM effect" instead of
        // presenting them to the page as one blob.
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
