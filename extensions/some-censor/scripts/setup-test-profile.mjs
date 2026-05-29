/**
 * BOYO — one-time (per-build) Firefox profile seeder.
 *
 * Run after every `pnpm build`:
 *
 *   pnpm build && pnpm test:setup
 *
 * Firefox will open. Verify the extension loads at about:debugging,
 * then CLOSE FIREFOX MANUALLY.
 *
 * ── CRITICAL: binary consistency ─────────────────────────────────────────────
 *
 * This script and the Playwright fixture MUST use the SAME Firefox binary.
 * Both read PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH.
 *
 * Why this matters:
 *   Firefox derives a unique UUID for each installed addon from its own
 *   installation path hash. If setup runs with binary A and tests run with
 *   binary B, the extensions.json written by A records UUID-A for your addon.
 *   When binary B loads the profile, it generates UUID-B for the same addon ID,
 *   finds no match in extensions.json, and silently skips loading the extension.
 *   The content script never injects. __BOYO_DEBUG__ never appears.
 *
 * On NixOS:
 *   PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH is exported by `nix develop .#playwright`.
 *   That is the canonical binary for both this script and fixture.ts.
 *   Never run this script with a different binary than Playwright uses.
 */

import { spawn } from "child_process"
import { existsSync, rmSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, "../dist")
const PROFILE = resolve(__dirname, "../tests/e2e/.playwright-firefox-profile")
const FIREFOX = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH

if (!FIREFOX) {
  console.error(
    "PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH not set.\n" +
      "Enter the playwright nix shell first:\n\n" +
      "  nix develop .#playwright\n"
  )
  process.exit(1)
}

if (!existsSync(resolve(DIST, "manifest.json"))) {
  console.error("dist/ not built — run pnpm build first")
  process.exit(1)
}

console.log(`Using Firefox binary: ${FIREFOX}`)
console.log(`Profile directory:    ${PROFILE}`)
console.log("")

for (const name of ["parent.lock", ".parentlock"]) {
  const p = join(PROFILE, name)
  try {
    rmSync(p, { force: true })
  } catch {}
}

console.log("Firefox will open. When it does:")
console.log("  1. Go to about:debugging#/runtime/this-firefox")
console.log("  2. Confirm 'BOYO - Content Censor' is listed under Extensions")
console.log("  3. If listed: close Firefox. Setup complete.")
console.log(
  "  4. If NOT listed: do not close — check terminal for web-ext errors."
)
console.log("")

const proc = spawn(
  "web-ext",
  [
    "run",
    "--firefox",
    FIREFOX,
    "--source-dir",
    DIST,
    "--firefox-profile",
    PROFILE,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--start-url",
    "about:debugging#/runtime/this-firefox",
    "--no-reload",
  ],
  { stdio: "inherit" }
)

proc.on("exit", (code) => {
  console.log("")
  if (code === 0 || code === null) {
    console.log("✓ Profile saved to:", PROFILE)
    console.log("  Run tests with: pnpm test:e2e")
    console.log("")
    console.log("  If the extension does not load during tests, verify that")
    console.log(
      "  PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH is the same binary used here:"
    )
    console.log(" ", FIREFOX)
  } else {
    console.error(`web-ext exited with code ${code}`)
    process.exit(code ?? 1)
  }
})
