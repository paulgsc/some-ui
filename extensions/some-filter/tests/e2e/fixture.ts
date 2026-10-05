/**
 * some-filter — Playwright Chromium extension fixture.
 *
 * Loads the unpacked extension from dist/ with --load-extension. Chromium
 * because Playwright cannot automate a Firefox with a temporary unsigned
 * extension; the content-script logic under test is browser-agnostic.
 *
 * NixOS: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to the Nix-patched Chromium
 * binary (done automatically by `nix develop .#playwright`).
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
 * Wait for the content script's first round to set data-sw-theme-applied,
 * then return the full debug snapshot.
 */
export async function waitForClassification(
  page: Page,
  timeout = 5_000
): Promise<FilterDebug> {
  // 1. `{ timeout }` MUST be the third argument: waitForFunction(fn, arg,
  //    options). As the second it is silently `arg`, leaving the 30s default.
  // 2. Timed polling, not `'raf'`: rAF is paused in occluded tabs (headed
  //    automation opens a second page), so raf polling could hang with the
  //    attribute already set.
  try {
    await page.waitForFunction(
      () => document.body.dataset["swThemeApplied"] !== undefined,
      undefined,
      { timeout, polling: 100 }
    )
  } catch (error) {
    // Dump the tab's state into the failure so the first failing run is
    // diagnosable (no script vs. stuck in legacy/off vs. pipeline threw).
    // Best-effort if the page is already gone.
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
    // `cause` is ES2022 and the lib target is ES2020; the wider structural
    // type lets it through without a cast.
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

    // New headless mode supports extensions without a display server; used
    // only where there is no display.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    // A fresh profile dir per run. A reused one lets chrome.storage.local's
    // tab-ID-keyed state accumulate, and Chromium reuses small tab IDs per
    // launch, so a stale entry could put a new tab in "legacy" and silently
    // skip the auto pipeline.
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
    // Pages opened via fixture.goto() are closed in teardown; with workers: 1
    // every test shares one context, and leaked pages eventually destabilize
    // it ("Target page, context or browser has been closed").
    const openedPages: Array<Page> = []

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({
      async goto(name: string) {
        const page = await context.newPage()
        openedPages.push(page)
        const filePath = path.join(FIXTURE_DIR, `${name}.html`)
        await page.goto(`file://${filePath}`)
        // Auto mode defers its first round while the tab is hidden, and every
        // page here is a new tab in a shared context. These specs are claims
        // about a page the user is looking at.
        await page.bringToFront()
        return page
      },
    })

    // Close every page this fixture opened; one the test already closed
    // throws, which is swallowed.
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
