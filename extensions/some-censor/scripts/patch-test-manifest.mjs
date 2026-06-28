/**
 * BOYO — patch dist/manifest.json for E2E test builds.
 *
 * The production manifest limits content script injection to YouTube URLs.
 * When running Playwright E2E tests the fixtures are served as file:// URLs,
 * so the content script would never inject unless we extend the match list.
 *
 * This script adds "file:/\/*\/*" to:
 *   - content_scripts[*].matches
 *   - host_permissions
 *
 * It only modifies dist/manifest.json (produced by build:chromium) and never
 * touches the source public/manifest.json.  The production artifact is
 * unaffected.  Run via:
 *
 *   pnpm test:e2e          (called automatically before `playwright test`)
 */

import { readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(__dirname, "../dist/manifest.json")

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))

const FILE_PATTERN = "file://*/*"

if (Array.isArray(manifest.content_scripts)) {
  for (const cs of manifest.content_scripts) {
    if (Array.isArray(cs.matches) && !cs.matches.includes(FILE_PATTERN)) {
      cs.matches.push(FILE_PATTERN)
    }
  }
}

if (Array.isArray(manifest.host_permissions)) {
  if (!manifest.host_permissions.includes(FILE_PATTERN)) {
    manifest.host_permissions.push(FILE_PATTERN)
  }
} else {
  manifest.host_permissions = [FILE_PATTERN]
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n")

console.log("[BOYO] dist/manifest.json patched for E2E testing (file:// added)")
