/**
 * BOYO — Playwright Firefox test fixture.
 *
 * Prerequisites (one-time setup):
 *   pnpm build && pnpm test:setup
 *
 * This seeds `.playwright-firefox-profile/` via `web-ext run`, which lets
 * Firefox write its own profile structure (prefs.js, extensions.json, addon
 * DB) with the extension properly registered. Subsequent test runs update the
 * XPI in-place; Firefox detects the version change and reloads the addon.
 *
 * Why not Chromium?
 *   The extension targets Firefox / MV2. Chromium's loader rejects MV2
 *   manifests with Gecko-specific fields, so the content script never runs
 *   and __BOYO_DEBUG__ never appears.
 *
 * Why not --load-extension / --install-extension?
 *   Firefox does not support those CLI flags in the way Chromium does.
 *   Extension registration lives in profile metadata (extensions.json), not
 *   filesystem presence. Only web-ext (or about:debugging) writes that
 *   metadata correctly. Once the profile is seeded we reuse it forever.
 *
 * NixOS note:
 *   PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH must be set — see nix/playwright/.
 *   The playwright nix shell exports it automatically.
 */

import { execSync } from "child_process"
import fs, { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { test as base, firefox, type BrowserContext } from "@playwright/test"

// ── Constants ─────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Must match manifest.json → browser_specific_settings.gecko.id exactly.
 * Firefox uses this as both the addon identifier and the XPI filename inside
 * the profile's extensions/ directory.
 */
const GECKO_ID = "boyo-extension@local.internal"

const EXTENSION_PATH = path.resolve(__dirname, "../../dist")
const MANIFEST_PATH = path.join(EXTENSION_PATH, "manifest.json")
const FIXTURE_DIR = path.resolve(__dirname, "fixtures")

// Profile is persistent — seeded once by `pnpm test:setup`, reused forever.
// Never wipe this between runs; Firefox's extensions.json must survive.
const PROFILE_DIR = path.resolve(__dirname, ".playwright-firefox-profile")

// The XPI lives at the path extensions.json already points at.
// We overwrite this file in-place before each launch — Firefox detects the
// version change and reloads the addon without needing extensions.json edits.
const XPI_DEST = path.join(PROFILE_DIR, "extensions", `${GECKO_ID}.xpi`)

// Temporary XPI built by web-ext before being copied to the profile
const XPI_BUILD = path.join(EXTENSION_PATH, "boyo.xpi")

// ── Pre-flight guards ─────────────────────────────────────────────────────────

if (!existsSync(MANIFEST_PATH)) {
  throw new Error(
    `[BOYO] Extension not built — manifest.json not found at:\n  ${MANIFEST_PATH}\n\n` +
      `Run:\n  pnpm --filter @some-extension/censor build\n`
  )
}

// ── NixOS browser resolution guard ───────────────────────────────────────────

const executablePath = process.env["PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH"]
if (!executablePath) {
  throw new Error(
    "[BOYO] PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH is not set.\n" +
      "Enter the playwright nix shell first:\n\n" +
      "  nix develop .#playwright\n"
  )
}

// ── Stale lock cleanup ────────────────────────────────────────────────────────
//
// Firefox writes parent.lock (and sometimes .parentlock) to the profile dir
// on launch and removes it on clean exit. A crashed Playwright run leaves it
// behind, causing the next launch to hang indefinitely believing another
// Firefox instance owns the profile.

function clearFirefoxLocks(profileDir: string): void {
  for (const name of ["parent.lock", ".parentlock"]) {
    const p = path.join(profileDir, name)
    try {
      fs.rmSync(p, { force: true })
    } catch {
      // rmSync with force:true should never throw; be defensive anyway
    }
  }
}

// ── XPI update ────────────────────────────────────────────────────────────────
//
// Firefox may cache addon metadata when the version string is unchanged and
// decide the addon is already up-to-date, skipping a real reload. We prevent
// this by stamping a unique version into the dist manifest before packaging.
//
// We stamp only the dist/ copy — never the source manifest. A full `pnpm build`
// resets dist/manifest.json to "1.0.0", and the next test run stamps it again.
// The stamp uses epoch seconds so every run produces a distinct version string.

function stampManifestVersion(): void {
  const raw = readFileSync(MANIFEST_PATH, "utf8")
  const manifest = JSON.parse(raw)
  const [major, minor] = (manifest.version as string).split(".").map(Number)
  // "1.0.0" → "1.0.<seconds>" — always unique, always > previous patch
  manifest.version = `${major}.${minor}.${Math.floor(Date.now() / 1000)}`
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
}

function buildAndDeployXpi(): string {
  // 1. Stamp a unique version so Firefox is forced to reload the addon
  stampManifestVersion()

  // 2. Build XPI from the stamped dist/
  try {
    execSync(
      [
        "web-ext build",
        `--source-dir ${EXTENSION_PATH}`,
        `--artifacts-dir ${EXTENSION_PATH}`,
        "--filename boyo.xpi",
        "--overwrite-dest",
      ].join(" "),
      { stdio: "pipe" }
    )
  } catch (err: any) {
    throw new Error(
      `[BOYO] web-ext build failed:\n${err.stderr?.toString() ?? err.message}`
    )
  }

  // 3. Ensure the extensions/ directory exists, otherwise copyFileSync will fail!
  const extensionsDir = path.dirname(XPI_DEST)
  if (!existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true })
  }

  // 4. Replace the XPI at the path extensions.json already points at.
  //    Firefox re-reads this file on launch when the version differs.
  copyFileSync(XPI_BUILD, XPI_DEST)

  return XPI_DEST
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
      ...args: Array<unknown>
    ): Promise<T>
  }
}

export const test = base.extend<
  BoyoFixtures & { page: import("@playwright/test").Page }
>({
  context: async ({}, use) => {
    // Step 1: stamp version, build XPI, deploy to profile
    const xpiPath = buildAndDeployXpi()

    // Step 2: clear stale lock files from any previous crashed run
    clearFirefoxLocks(PROFILE_DIR)

    // 2. Dynamically create a Firefox Enterprise Policy to force-install the local file
    const policiesPath = path.join(PROFILE_DIR, "policies.json")
    const policyContent = {
      policies: {
        ExtensionSettings: {
          [GECKO_ID]: {
            installation_mode: "force_installed",
            install_url: `file://${xpiPath}`,
          },
        },
      },
    }

    if (!fs.existsSync(PROFILE_DIR))
      fs.mkdirSync(PROFILE_DIR, { recursive: true })
    fs.writeFileSync(policiesPath, JSON.stringify(policyContent, null, 2))

    // 3. Point Playwright to the policy file via environment variable
    process.env.PLAYWRIGHT_FIREFOX_POLICIES_JSON = policiesPath

    // Step 3: launch Firefox with the persistent profile.
    // The profile's extensions.json already points at XPI_DEST.
    // Firefox detects the new version and reloads the addon from the updated XPI.
    const context = await firefox.launchPersistentContext(PROFILE_DIR, {
      executablePath,
      headless: false,

      firefoxUserPrefs: {
        // Allow unsigned dev builds
        "xpinstall.signatures.required": false,
        // Enable extensions in all scopes (including file:// and local pages)
        "extensions.autoDisableScopes": 0,
        "extensions.enabledScopes": 15,
        // Disable update checks — we control the version via stamping
        "extensions.update.enabled": false,
        "extensions.update.autoUpdateDefault": false,
        // Suppress first-run UI that can steal focus mid-test
        "browser.startup.homepage": "about:blank",
        "browser.startup.page": 0,
        "datareporting.policy.dataSubmissionEnabled": false,
        "datareporting.healthreport.uploadEnabled": false,
      },

      args: ["--no-remote"],
      timeout: 15_000,
    })

    // Step 4: stub browser.runtime in page context.
    //
    // The content script calls browser.runtime.sendMessage for IS_WHITELISTED
    // and GET_ENABLED. The real background script isn't running in the test
    // environment (we only load the extension, not a background server), so we
    // intercept these calls here and return safe defaults.
    //
    // This stub runs in the PAGE context, not the extension context — it does
    // not affect the extension's own background script channel. The content
    // script reads window.browser which, in Firefox, is the real WebExtension
    // API object; addInitScript injects BEFORE the page's own scripts run but
    // AFTER the extension's content script injects, so the stub must not
    // override the real browser object for extension-originated calls.
    //
    // The correct approach: the content script uses browser.runtime directly
    // (which is the real extension API), while addInitScript sets window.browser
    // only as a fallback for any page-level script that tries to access it.
    // In practice this stub is a safety net; the real calls go through the
    // extension's own runtime channel.
    await context.addInitScript(() => {
      // Only set if the real extension API hasn't already defined it
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
            onMessage: {
              addListener: () => {},
              removeListener: () => {},
            },
          },
        }
      }
    })

    await use(context)
    await context.close()
  },

  // Route the default page fixture to your persistent context
  page: async ({ context }, use) => {
    // Persistent contexts always launch with one page already open.
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
