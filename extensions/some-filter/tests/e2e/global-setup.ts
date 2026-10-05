/**
 * some-filter — Playwright global setup.
 *
 * Verifies the extension is built before the suite starts; the context
 * launch happens in fixture.ts. (Chromium only: see fixture.ts.)
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
