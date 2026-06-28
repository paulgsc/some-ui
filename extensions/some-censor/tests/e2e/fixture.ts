/**
 * BOYO — Playwright Chromium extension test fixture.
 *
 * Uses Chromium's --load-extension to load the unpacked extension from dist/.
 * No signing, no profile seeding, no separate launcher process.
 *
 * Why Chromium:
 *   See global-setup.ts for the full explanation. Short version: Playwright has
 *   no supported path for loading temporary unsigned extensions into Firefox and
 *   then automating that Firefox instance. Chromium's --load-extension solves
 *   this in one line. The extension logic under test is browser-agnostic.
 *
 * Extension loading mechanics:
 *   chromium.launchPersistentContext() with --load-extension=<dist> and
 *   --disable-extensions-except=<dist> loads the extension at browser startup.
 *   The persistent context is required — extensions don't load in incognito
 *   or in non-persistent contexts.
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
// Chromium needs a writable user data dir for the persistent context
const USER_DATA_DIR = path.resolve(__dirname, ".chromium-user-data")

export const CDP_PORT = 9222

// ── Types ─────────────────────────────────────────────────────────────────────

export type BoyoDebug = {
  tick: number
  phase: "idle" | "running"
  mounted: number
  unresolved: number
  entries: Record<
    string,
    {
      videoId: string
      channelId: string
      viewKind: "masked" | "meta" | "title" | "revealed" | "whitelisted"
      isConnected: boolean
    }
  >
  lastMutationMs: number | null
  navigations: number
  sessionOrdinal: number
}

// ── Polling helpers ───────────────────────────────────────────────────────────

async function readDebug(page: Page): Promise<BoyoDebug | null> {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions */
  return page.evaluate(
    () => ((window as any).__BOYO_DEBUG__ as BoyoDebug | undefined) ?? null
  )
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions */
}

async function pollDebug(
  page: Page,
  predicate: (d: BoyoDebug) => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<BoyoDebug> {
  const { timeout = 8000, interval = 100 } = options
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const snap = await readDebug(page)
    if (snap && predicate(snap)) return snap
    await new Promise((r) => setTimeout(r, interval))
  }

  const final = await readDebug(page)
  throw new Error(
    `[BOYO] pollDebug timed out after ${timeout}ms.\n` +
      `Final snapshot: ${JSON.stringify(final, null, 2)}`
  )
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type BoyoFixtures = {
  context: BrowserContext
  fixture: {
    goto(name?: string): Promise<Page>
    pollDebug(
      page: Page,
      predicate: (d: BoyoDebug) => boolean,
      options?: { timeout?: number }
    ): Promise<BoyoDebug>
    readDebug(page: Page): Promise<BoyoDebug | null>
    fixtureCall<T>(
      page: Page,
      method: string,
      ...args: Array<unknown>
    ): Promise<T>
  }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

export const test = base.extend<BoyoFixtures & { page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[BOYO] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
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
        // Required for file:// URLs to have access to extension APIs
        "--allow-file-access-from-files",
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
      ],
    })

    // Stub browser.runtime for fixture page-level JS.
    // The content script uses the real extension API injected by Chromium.
    await context.addInitScript(
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-argument */
      () => {
        document.addEventListener("__boyo_debug_update__", (e: any) => {
          window.__BOYO_DEBUG__ = JSON.parse(
            e.detail
          ) as typeof window.__BOYO_DEBUG__
        })

        if (!(window as any).chrome?.runtime?.sendMessage) {
          ;(window as any).chrome = {
            runtime: {
              // eslint-disable-next-line @typescript-eslint/require-await
              sendMessage: async (msg: any): Promise<unknown> => {
                if (msg.type === "IS_WHITELISTED")
                  return { ok: true, whitelisted: false }
                if (msg.type === "GET_ENABLED")
                  return { ok: true, enabled: true }
                if (msg.type === "ADD_WHITELIST") return { ok: true }
                return { ok: true }
              },
              onMessage: {
                addListener: (): void => {},
                removeListener: (): void => {},
              },
            },
          }
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-argument */
    )

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
      async goto(name = "yt-home") {
        const page = await context.newPage()
        const filePath = path.join(FIXTURE_DIR, `${name}.html`)
        await page.goto(`file://${filePath}`)
        return page
      },
      pollDebug,
      readDebug,
      async fixtureCall<T>(
        page: Page,
        method: string,
        ...args: Array<unknown>
      ): Promise<T> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-return
        return page.evaluate(([m, a]) => (window as any).__FIXTURE__[m](...a), [
          method,
          args,
        ] as const) as Promise<T>
      },
    })
  },
})

export { expect } from "@playwright/test"
