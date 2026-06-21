/**
 * some-filter — Playwright global setup.
 *
 * Verifies the extension is built before the suite starts.
 * Chromium context launch (with --load-extension) happens inside fixture.ts,
 * not here — no process to spawn.
 *
 * Why Chromium and not Firefox:
 *   Playwright has no mechanism to attach to a web-ext-managed Firefox process.
 *   Chromium's --load-extension loads an unpacked MV2 extension directly from
 *   dist/, no signing required. The prepaint-handshake logic under test is
 *   browser-agnostic; Firefox-specific rendering is covered by manual smoke
 *   testing with web-ext.
 */

import { existsSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, "../../dist")
const MANIFEST_PATH = resolve(DIST, "manifest.json")

export default function globalSetup(): void {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `[FILTER] Extension not built — manifest.json not found at:\n  ${MANIFEST_PATH}\n\n` +
        `Run:\n  pnpm --filter @some-extension/filter build:chromium\n`
    )
  }

  console.log(`[FILTER] Extension found at: ${DIST}`)
  console.log(
    `[FILTER] Chromium will load it via --load-extension at test start.`
  )
}
