/**
 *
 * NixOS browser resolution:
 *   Playwright internally pins a browser revision and looks for it in its own
 *   download cache. On NixOS that cache never exists — nixpkgs ships a
 *   Nix-patched Chromium at a different revision and layout than what the
 *   Playwright npm package expects.
 *
 *   The fix is to pass `executablePath` explicitly to launchPersistentContext
 *   so Playwright never touches its own browser resolution logic.
 *   The path comes from PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, which the
 *   .#playwright nix shell resolves at eval time via builtins.readDir.
 *
 *   We hard-fail if the env var is missing so CI can never silently regress
 *   to Playwright's internal browser lookup.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { test as base, chromium, type BrowserContext } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extensions/some-censor/dist"
)
const FIXTURE_DIR = path.resolve(__dirname, "fixtures")

// ── NixOS browser resolution guard ───────────────────────────────────────────

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
if (!executablePath) {
  throw new Error(
    "[BOYO] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
      "Enter the playwright nix shell first:\n\n" +
      "  nix develop .#playwright\n"
  )
}

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

// ── Stale lock cleanup ────────────────────────────────────────────────────────
//
// Chromium writes lock files to the profile directory on launch and removes
// them on clean exit. A crashed Playwright run (Ctrl-C, OOM, segfault) leaves
// these behind. The next launchPersistentContext call then hangs indefinitely
// waiting for a Chromium process that no longer exists.
//
// Files cleared: SingletonLock, SingletonCookie, SingletonSocket.
// Safe to delete unconditionally — Chromium recreates them on every launch.
function clearChromiumLocks(profileDir: string): void {
  const locks = ["SingletonLock", "SingletonCookie", "SingletonSocket"]
  for (const name of locks) {
    const p = path.join(profileDir, name)
    try {
      fs.rmSync(p, { force: true }) // force: true = no error if missing
    } catch {
      // rmSync with force:true should never throw, but be defensive
    }
  }
}

// ── Custom fixture ────────────────────────────────────────────────────────────

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
      ...args: unknown[]
    ): Promise<T>
  }
}

export const test = base.extend<BoyoFixtures>({
  context: async ({}, use) => {
    const userDataDir = path.resolve(__dirname, ".playwright-profile")

    // Clear any stale Chromium singleton locks before attempting launch.
    // Must happen before launchPersistentContext — not after — because the
    // hang occurs during launch itself, not after.
    clearChromiumLocks(userDataDir)

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,

      // Fail fast with a clear error rather than hanging until the test
      // timeout fires with no diagnostic information.
      timeout: 15_000,

      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
      ],
    })

    // Stub browser.runtime.sendMessage for the content script.
    await context.addInitScript(() => {
      ;(window as any).browser = {
        runtime: {
          sendMessage: async (msg: any) => {
            if (msg.type === "IS_WHITELISTED")
              return { ok: true, whitelisted: false }
            if (msg.type === "GET_ENABLED") return { ok: true, enabled: true }
            if (msg.type === "ADD_WHITELIST") return { ok: true }
            return { ok: true }
          },
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
          },
        },
      }
    })

    await use(context)
    await context.close()
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
