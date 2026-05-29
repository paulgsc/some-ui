
/**
 * BOYO — Playwright global setup.
 *
 * Launches Chromium with the extension loaded via --load-extension.
 *
 * Why Chromium and not Firefox:
 *   Playwright has no mechanism to attach to a web-ext-managed Firefox process.
 *   Firefox doesn't speak Chrome CDP (connectOverCDP won't work).
 *   Firefox's own Playwright protocol doesn't support loading temporary extensions.
 *   Unsigned Firefox extensions are session-only and can't be persisted in profiles.
 *
 *   Chromium solves all of this: --load-extension loads an unpacked extension
 *   directly from dist/, no signing required, no profile seeding, no separate
 *   launcher process. Playwright's chromium.launchPersistentContext handles it
 *   natively in a single call.
 *
 * What we're actually testing:
 *   FSM logic, session monotonicity, DOM masking, navigation handling.
 *   None of that is Firefox-specific. The extension uses the `browser.*` namespace
 *   which Chromium has supported since Chrome 88. The only Firefox-specific field
 *   in manifest.json is `browser_specific_settings` — Chromium ignores unknown
 *   fields in MV2 and loads the extension fine.
 *
 * Firefox-specific manual verification:
 *   Use `web-ext run` for manual smoke testing on Firefox.
 *   The Playwright suite covers logic correctness; manual testing covers
 *   Firefox rendering and any gecko-specific edge cases.
 */

import { existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, "../../dist")
const MANIFEST_PATH = resolve(DIST, "manifest.json")

export default async function globalSetup() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `[BOYO] Extension not built — manifest.json not found at:\n  ${MANIFEST_PATH}\n\n` +
        `Run:\n  pnpm --filter @some-extension/censor build\n`
    )
  }

  console.log(`[BOYO] Extension found at: ${DIST}`)
  console.log(`[BOYO] Chromium will load it via --load-extension at test start.`)
}
