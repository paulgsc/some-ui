/**
 * some-mujik — Playwright global setup.
 *
 * Verifies the extension is built before the suite starts.
 * Chromium context launch (with --load-extension) happens inside fixture.ts.
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
      `[MUJIK] Extension not built — manifest.json not found at:\n  ${MANIFEST_PATH}\n\n` +
        `Run:\n  pnpm --filter @some-extension/mujik build:chromium\n`
    )
  }

  console.log(`[MUJIK] Extension found at: ${DIST}`)
  console.log(
    `[MUJIK] Chromium will load it via --load-extension at test start.`
  )
}
