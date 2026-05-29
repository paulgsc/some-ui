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
import { test as base, chromium, type BrowserContext } from "@playwright/test"

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

async function readDebug(
  page: import("@playwright/test").Page
): Promise<BoyoDebug | null> {
  return page.evaluate(() => (window as any).__BOYO_DEBUG__ ?? null)
}

async function pollDebug(
  page: import("@playwright/test").Page,
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
    goto(name?: string): Promise<import("@playwright/test").Page>
    pollDebug(
      page: import("@playwright/test").Page,
      predicate: (d: BoyoDebug) => boolean,
      options?: { timeout?: number }
    ): Promise<BoyoDebug>
    readDebug(page: import("@playwright/test").Page): Promise<BoyoDebug | null>
    fixtureCall<T>(
      page: import("@playwright/test").Page,
      method: string,
      ...args: Array<unknown>
    ): Promise<T>
  }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

export const test = base.extend<
  BoyoFixtures & { page: import("@playwright/test").Page }
>({
  context: async ({}, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[BOYO] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
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
        // Required for file:// URLs to have access to extension APIs
        "--allow-file-access-from-files",
      ],
    })

    // Stub browser.runtime for fixture page-level JS.
    // The content script uses the real extension API injected by Chromium.
    await context.addInitScript(() => {
      if (!(window as any).browser?.runtime?.sendMessage) {
        ;(window as any).browser = {
          runtime: {
            sendMessage: async (msg: any) => {
              if (msg.type === "IS_WHITELISTED")
                return { ok: true, whitelisted: false }
              if (msg.type === "GET_ENABLED") return { ok: true, enabled: true }
              if (msg.type === "ADD_WHITELIST") return { ok: true }
              return { ok: true }
            },
            onMessage: { addListener: () => {}, removeListener: () => {} },
          },
        }
      }
    })

    await use(context)
    await context.close()
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage())
    await use(page)
  },

  fixture: async ({ context }, use) => {
    await use({
      async goto(name = "yt-home") {
        const page = await context.newPage()
        const filePath = path.join(FIXTURE_DIR, `${name}.html`)
        await page.goto(`file://${filePath}`)
        return page
      },
      pollDebug,
      readDebug,
      async fixtureCall(page, method, ...args) {
        return page.evaluate(([m, a]) => (window as any).__FIXTURE__[m](...a), [
          method,
          args,
        ] as const)
      },
    })
  },
})

export { expect } from "@playwright/test"
