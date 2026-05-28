import { spawn } from "child_process"
import { existsSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, "../dist")
const PROFILE = resolve(__dirname, "../tests/e2e/.playwright-firefox-profile")
const FIREFOX = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH

if (!FIREFOX) {
  console.error(
    "PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH not set — enter nix develop .#playwright first"
  )
  process.exit(1)
}

if (!existsSync(resolve(DIST, "manifest.json"))) {
  console.error("dist/ not built — run pnpm build first")
  process.exit(1)
}

console.log("Setting up Firefox test profile with extension pre-installed...")
console.log("Firefox will open.")
console.log("Verify the extension is loaded, then CLOSE FIREFOX manually.")
console.log("The script will finish after Firefox exits.")
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
    "about:blank",
    "--no-reload",
  ],
  { stdio: "inherit" }
)

proc.on("exit", () => {
  console.log("")
  console.log("Profile saved to:", PROFILE)
  console.log("Run tests with: pnpm test:e2e")
})
