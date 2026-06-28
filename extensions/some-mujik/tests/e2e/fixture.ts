/**
 * some-mujik — Playwright Chromium extension fixture.
 *
 * Uses Chromium's --load-extension to load the unpacked extension from dist/.
 * Headless is disabled: Chromium does not inject extension content scripts in
 * headless mode.
 *
 * Why Chromium and not Firefox:
 *   Playwright has no supported path for loading temporary unsigned extensions
 *   into Firefox and then automating that instance. Chromium's --load-extension
 *   handles this in one call. The display-role logic under test (overlay mount,
 *   getOverlayRoot) is browser-agnostic.
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

export type MujikDebug = {
  /** true if #__sw_overlay_root exists in document.body */
  hasOverlayRoot: boolean
  /** true if any ytmo-card element is present in the overlay root */
  hasCard: boolean
}

// ── Init poller ───────────────────────────────────────────────────────────────

/**
 * Read the current mujik DOM state. Does not wait for any condition — the
 * display role is passive until a ytmo:song-data message arrives, so the
 * absence of overlay root and card IS the expected initial state.
 */
export async function readMujikState(page: Page): Promise<MujikDebug> {
  return page.evaluate((): MujikDebug => {
    const root = document.getElementById("__sw_overlay_root")
    return {
      hasOverlayRoot: root !== null,
      hasCard: root !== null && root.querySelector(".ytmo-card") !== null,
    }
  })
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type MujikFixtures = {
  context: BrowserContext
  fixture: {
    goto(name: string): Promise<Page>
  }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

export const test = base.extend<MujikFixtures & { page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[MUJIK] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
          "Enter the playwright nix shell:\n\n" +
          "  nix develop .#playwright\n"
      )
    }

    // Chrome's new headless mode supports extensions and works without a
    // display server (no DISPLAY/WAYLAND_DISPLAY). Use it in CI environments
    // where no display is available; skip it locally so the window is visible.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        "--allow-file-access-from-files",
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
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
