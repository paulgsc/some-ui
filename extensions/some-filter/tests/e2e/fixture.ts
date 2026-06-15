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

export type FilterDebug = {
  themeApplied: string | undefined
  luminance: string | undefined
  tabState: string | undefined
  hasDarkAttr: boolean
  hasPrepaintAttr: boolean
  /** null = no prepaint sheet found in document.styleSheets */
  prepaintSheetDisabled: boolean | null
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
  await page.waitForFunction(
    () => document.body.dataset["swThemeApplied"] !== undefined,
    { timeout }
  )

  return page.evaluate((): FilterDebug => {
    const sheets = Array.from(document.styleSheets)
    const prepaint = sheets.find((s) => s.href?.endsWith("prepaint.css"))

    return {
      themeApplied: document.body.dataset["swThemeApplied"],
      luminance: document.body.dataset["swLuminance"],
      tabState: document.body.dataset["swTabState"],
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      hasPrepaintAttr:
        document.documentElement.hasAttribute("data-sw-prepaint"),
      prepaintSheetDisabled: prepaint ? prepaint.disabled : null,
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
  context: async (_fixtures, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[FILTER] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
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
