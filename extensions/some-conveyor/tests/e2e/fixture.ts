/**
 * some-conveyor — Playwright Chromium extension fixture.
 *
 * Uses Chromium's --load-extension to load the unpacked extension from dist/.
 * No signing, no profile seeding, no separate launcher process.
 *
 * Why Chromium:
 *   Playwright has no supported path for loading temporary unsigned extensions
 *   into Firefox and then automating that Firefox instance. Chromium's
 *   --load-extension solves this in one call. The conveyor logic (shadow DOM
 *   init, WASM graceful failure, cube rendering) is entirely browser-agnostic.
 *
 * NixOS:
 *   Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to the Nix-patched Chromium binary
 *   (done automatically by `nix develop .#playwright`).
 */

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
const USER_DATA_DIR = path.resolve(__dirname, ".chromium-user-data")

// ── Debug snapshot ────────────────────────────────────────────────────────────

export type ConveyorDebug = {
  /** true if #some-conveyor-host exists in document.body */
  hasHost: boolean
  /** value of data-some-conveyor on the host element, undefined if absent */
  hostDataAttr: string | undefined
  /** value of data-some-conveyor-loaded on <html>, undefined if absent */
  guardAttr: string | undefined
}

// ── Init poller ───────────────────────────────────────────────────────────────

/**
 * Wait for the conveyor content script to finish its async init path
 * (init() appends #some-conveyor-host to document.body), then return the
 * full debug snapshot.
 *
 * Timeout is generous: document_end fires after DOMContentLoaded and the
 * shadow host is inserted synchronously within init(). In practice, the host
 * appears within a few event loop ticks after the content script runs.
 */
export async function waitForConveyorInit(
  page: Page,
  timeout = 5_000
): Promise<ConveyorDebug> {
  await page.waitForFunction(
    () => document.getElementById("some-conveyor-host") !== null,
    { timeout }
  )

  return page.evaluate((): ConveyorDebug => {
    const host = document.getElementById("some-conveyor-host")
    return {
      hasHost: host !== null,
      hostDataAttr: host?.getAttribute("data-some-conveyor") ?? undefined,
      guardAttr:
        document.documentElement.getAttribute("data-some-conveyor-loaded") ??
        undefined,
    }
  })
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type ConveyorFixtures = {
  context: BrowserContext
  fixture: {
    goto(name: string): Promise<Page>
  }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

export const test = base.extend<ConveyorFixtures & { page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[CONVEYOR] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
          "Enter the playwright nix shell:\n\n" +
          "  nix develop .#playwright\n"
      )
    }

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        // file:// pages need this flag to receive extension content scripts
        "--allow-file-access-from-files",
      ],
    })

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context)
    await context.close()
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage())
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },

  fixture: async ({ context }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({
      async goto(name: string) {
        const page = await context.newPage()
        const filePath = path.join(FIXTURE_DIR, `${name}.html`)
        await page.goto(`file://${filePath}`)
        return page
      },
    })
  },
})

export { expect } from "@playwright/test"
