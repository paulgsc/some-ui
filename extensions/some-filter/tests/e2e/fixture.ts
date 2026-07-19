/**
 * some-filter — Playwright Chromium extension fixture.
 *
 * Uses Chromium's --load-extension to load the unpacked extension from dist/.
 * No signing, no profile seeding, no separate launcher process.
 *
 * Why Chromium:
 *   Playwright has no supported path for loading temporary unsigned extensions
 *   into Firefox and then automating that Firefox instance. Chromium's
 *   --load-extension solves this in one call. The content-script logic under
 *   test (prepaint handshake, classifyPage, dark-theme injection) is entirely
 *   browser-agnostic.
 *
 * NixOS:
 *   Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to the Nix-patched Chromium binary
 *   (done automatically by `nix develop .#playwright`).
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, "../../dist")
const FIXTURE_DIR = path.resolve(__dirname, "fixtures")

// ── Debug snapshot ────────────────────────────────────────────────────────────

export type FilterDebug = {
  themeApplied: string | undefined
  luminance: string | undefined
  tabState: string | undefined
  hasDarkAttr: boolean
  /** the overlay veil element is still present in the DOM */
  hasPrepaintVeil: boolean
}

// ── Classification poller ─────────────────────────────────────────────────────

/**
 * Wait for content.js to finish its synchronous init path (runAutoClassify sets
 * data-sw-theme-applied) then return the full debug snapshot.
 *
 * Timeout is generous: document_end fires after DOMContentLoaded and the init
 * path is synchronous, so in practice the attr is set within one event loop
 * tick after page load.
 */
export async function waitForClassification(
  page: Page,
  timeout = 5_000
): Promise<FilterDebug> {
  // Two things matter here:
  //  1. `{ timeout }` MUST be the third (options) argument. Playwright's
  //     signature is waitForFunction(pageFunction, arg, options) — passed as
  //     the second argument it is silently treated as `arg` (handed to the
  //     page function, which ignores it), leaving the real timeout at its
  //     30s default. That is the "everything times out at 30s" symptom.
  //  2. `polling: <number>` (timed) rather than the default `'raf'`. The attr
  //     is set synchronously by the pipeline's onFire hook, but rAF is paused
  //     in tabs the browser treats as non-foreground (headed automation opens
  //     a second page, so the fixture page is frequently occluded). With raf
  //     polling the predicate is never re-evaluated there and the wait hangs
  //     forever even though the attribute is already present. setTimeout still
  //     fires (throttled) in occluded tabs, so timed polling always observes
  //     it. This mirrors the veil-teardown timer fallback in prepaint.ts.
  try {
    await page.waitForFunction(
      () => document.body.dataset["swThemeApplied"] !== undefined,
      undefined,
      { timeout, polling: 100 }
    )
  } catch (error) {
    // A bare timeout here only ever said "5000ms exceeded" — useless on its
    // own, since it cannot distinguish "content script never ran" from "tab
    // is stuck in legacy/off mode" from "pipeline threw before onFire" from
    // any other stage. Dump the tab's actual state into the failure message
    // so the *first* failing run is diagnosable without re-instrumenting by
    // hand. (Best-effort: if the page/context is already gone, report that
    // instead of masking the original timeout with a second error.)
    let diagnostic = "(page unavailable for diagnostic snapshot)"
    try {
      const snapshot = await page.evaluate(() => ({
        bodyDataset: { ...document.body.dataset },
        htmlDataset: { ...document.documentElement.dataset },
        readyState: document.readyState,
        hasVeil: document.getElementById("__sw_prepaint_veil") !== null,
      }))
      diagnostic = JSON.stringify(snapshot, null, 2)
    } catch {
      // page/context already closed — original error is diagnostic enough
    }
    // `cause` is an ES2022 Error feature; this project's lib target is
    // ES2020, so the two-arg constructor overload isn't typed. Declaring the
    // variable with the wider structural type (rather than casting) lets the
    // assignment through without `any` — it still works at runtime (Node and
    // every evergreen browser have supported Error.cause for years) and
    // preserves the original error for anything that reads it.
    const wrapped: Error & { cause?: unknown } = new Error(
      `waitForClassification timed out after ${timeout}ms. Tab state at ` +
        `failure:\n${diagnostic}\n\nOriginal error: ${String(error)}`
    )
    wrapped.cause = error
    throw wrapped
  }

  return page.evaluate((): FilterDebug => {
    return {
      themeApplied: document.body.dataset["swThemeApplied"],
      luminance: document.body.dataset["swLuminance"],
      tabState: document.body.dataset["swTabState"],
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      hasPrepaintVeil: document.getElementById("__sw_prepaint_veil") !== null,
    }
  })
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type FilterFixtures = {
  context: BrowserContext
  fixture: {
    goto(name: string): Promise<Page>
  }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

export const test = base.extend<FilterFixtures & { page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[FILTER] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
          "Enter the playwright nix shell:\n\n" +
          "  nix develop .#playwright\n"
      )
    }

    // Chrome's new headless mode supports extensions and works without a
    // display server (no DISPLAY/WAYLAND_DISPLAY). Use it in CI environments
    // where no display is available; skip it locally so the window is visible.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    // A fresh profile dir per run, not a fixed committed path. --load-extension
    // requires a *persistent* context (Playwright has no other API for loading
    // unsigned extensions), but "persistent" here must mean "for the lifetime
    // of this one launch," never "reused across separate `playwright test`
    // invocations." A fixed, reused directory lets chrome.storage.local's
    // filteredTabIds/tabStates (background.ts, keyed by raw tab ID) accumulate
    // across runs; Chromium assigns tab IDs freshly per process, typically from
    // the same small integers each launch, so a stale entry from an old run can
    // collide with a brand-new tab's ID and misclassify it as filter-enabled
    // ("legacy") before the extension ever gets a chance to run auto mode —
    // silently skipping the entire dark-theme pipeline with no throw anywhere
    // to explain it. A disposable directory makes every run start from the
    // same clean slate CI already gets from its fresh checkout.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-filter-e2e-"))

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        // file:// pages need this flag to receive extension content scripts
        "--allow-file-access-from-files",
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
      ],
    })

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context)
    await context.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage())
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },

  fixture: async ({ context }, use) => {
    // Pages opened via fixture.goto() are tracked here and closed in this
    // fixture's own teardown. Without this, every fixture.goto() call across
    // every test in the file leaks a page for the lifetime of the worker —
    // playwright.config.ts pins workers: 1, so all 12+ tests in this suite
    // share one BrowserContext and accumulate pages with no bound. Enough
    // orphaned pages eventually destabilizes the context (observed as
    // "Target page, context or browser has been closed" mid-test).
    const openedPages: Array<Page> = []

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({
      async goto(name: string) {
        const page = await context.newPage()
        openedPages.push(page)
        const filePath = path.join(FIXTURE_DIR, `${name}.html`)
        await page.goto(`file://${filePath}`)
        return page
      },
    })

    // Teardown: close every page this fixture instance opened, regardless
    // of whether the test passed, failed, or the page was already closed
    // by the test itself. Closing an already-closed page is a no-op error
    // we deliberately swallow — order of teardown vs. test-level cleanup
    // is not guaranteed and either side may have already closed it.
    await Promise.all(
      openedPages.map((p) =>
        p.close().catch(() => {
          // already closed — fine
        })
      )
    )
  },
})

export { expect } from "@playwright/test"
